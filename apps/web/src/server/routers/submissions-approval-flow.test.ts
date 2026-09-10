import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * End-to-end (in-process) test of design-plan.md Milestone 8's acceptance
 * criterion: submit → approve → appears in mandals.list. No live Supabase
 * project exists in CI (.github/workflows/ci.yml runs no DB service), so
 * this drives the real router stack (submissions.create → submissions.review
 * → mandals.list) against a hand-rolled in-memory Postgrest-alike fake
 * instead — enough to exercise the app-layer logic these procedures own
 * (rate limiting, duplicate check, slug generation, the approve RPC call
 * shape), while the RPC functions' own SQL is out of this test's reach.
 */

type Row = Record<string, unknown>

type FakeResult = { data: unknown; count?: number; error: null }

class FakeQueryBuilder implements PromiseLike<FakeResult> {
  private filters: Array<(row: Row) => boolean> = []
  private wantCount = false
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private limitCount: number | null = null
  private orderCol: string | null = null
  private orderAsc = true
  private singleMode: 'single' | 'maybeSingle' | null = null
  private pendingInsert: Row | null = null
  private pendingUpdate: Row | null = null

  constructor(
    private readonly table: Row[],
    private readonly tableName: string
  ) {}

  select(_columns?: string, opts?: { count?: 'exact' }) {
    this.wantCount = opts?.count === 'exact'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }

  // submissions.list's mandal join (edit_mandal rows) looks up several
  // mandal ids in one query rather than one round trip per row.
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }

  // submissions.review looks up only the slugs that could collide with the
  // one it's about to mint, rather than reading every slug in the table.
  like(column: string, pattern: string) {
    const prefix = pattern.endsWith('%') ? pattern.slice(0, -1) : pattern
    this.filters.push((row) => String(row[column] ?? '').startsWith(prefix))
    return this
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderCol = column
    this.orderAsc = opts?.ascending !== false
    return this
  }

  range(from: number, to: number) {
    this.rangeFrom = from
    this.rangeTo = to
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  insert(row: Row) {
    this.pendingInsert = row
    return this
  }

  update(patch: Row) {
    this.pendingUpdate = patch
    return this
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle'
    return this
  }

  single() {
    this.singleMode = 'single'
    return this
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute() {
    if (this.pendingInsert) {
      // Mirrors the column defaults supabase/migrations/0001_core_schema.sql
      // gives submissions rows (nullable columns default to NULL, submitted_at
      // defaults to now()) — real Postgres backfills these; this in-memory
      // fake has to do it explicitly.
      const defaults =
        this.tableName === 'submissions'
          ? {
              mandal_id: null,
              moderator_notes: null,
              reviewed_at: null,
              submitted_at: new Date().toISOString(),
            }
          : {}
      this.table.push({ id: randomUUID(), ...defaults, ...this.pendingInsert })
      return { data: null, error: null }
    }

    if (this.pendingUpdate) {
      this.table
        .filter((row) => this.filters.every((f) => f(row)))
        .forEach((row) => Object.assign(row, this.pendingUpdate))
      const updated = this.table.find((row) => this.filters.every((f) => f(row))) ?? null
      return { data: updated ? { ...updated } : null, error: null }
    }

    let rows = this.table.filter((row) => this.filters.every((f) => f(row)))
    const count = rows.length

    if (this.orderCol) {
      const col = this.orderCol
      rows = [...rows].sort((a, b) => {
        const av = a[col] as string | number
        const bv = b[col] as string | number
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return this.orderAsc ? cmp : -cmp
      })
    }

    if (this.rangeFrom !== null && this.rangeTo !== null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1)
    }
    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount)
    }

    if (this.singleMode) {
      return { data: rows[0] ? { ...rows[0] } : null, error: null }
    }

    return {
      data: rows.map((row) => ({ ...row })),
      count: this.wantCount ? count : undefined,
      error: null,
    }
  }

  get [Symbol.toStringTag]() {
    return `FakeQueryBuilder(${this.tableName})`
  }
}

function createFakeDb() {
  const tables: Record<string, Row[]> = { mandals: [], submissions: [], moderators: [] }

  const client = {
    from(tableName: string) {
      if (!tables[tableName]) tables[tableName] = []
      return new FakeQueryBuilder(tables[tableName], tableName)
    },
    async rpc(fnName: string, args: Record<string, unknown>) {
      if (fnName === 'rate_limit_check') {
        return { data: true, error: null }
      }

      // Stands in for supabase/migrations/0010_duplicate_candidates.sql.
      // The real function narrows by trigram similarity and a lat/lng box;
      // this fake returns every mandal, which is a superset — the precise
      // scoring that decides a duplicate lives in duplicate-check.ts and is
      // what this flow actually exercises.
      if (fnName === 'mandal_duplicate_candidates') {
        return {
          data: tables.mandals.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            area: row.area,
            lat: row.lat,
            lng: row.lng,
          })),
          error: null,
        }
      }

      if (fnName === 'approve_edit_mandal_submission') {
        const mandal = tables.mandals.find((row) => row.id === args.p_mandal_id)
        if (mandal) {
          Object.assign(mandal, args.p_patch as Row)
        }
        const submission = tables.submissions.find((row) => row.id === args.p_submission_id)
        if (submission) {
          submission.status = 'approved'
          submission.moderator_notes = args.p_moderator_notes
          submission.reviewed_at = new Date().toISOString()
        }
        return { data: mandal?.slug ?? null, error: null }
      }

      if (fnName === 'approve_new_mandal_submission') {
        const mandal = args.p_mandal as Row
        // Mirrors supabase/migrations/0001_core_schema.sql's column defaults
        // for a fresh mandals row (zone/history nullable with no producer
        // yet, verification_status defaults to 'unverified', timestamps
        // default to now()) — Postgres backfills these for real.
        tables.mandals.push({
          id: randomUUID(),
          zone: null,
          history: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...mandal,
          source: 'crowdsourced',
          verification_status: 'unverified',
        })
        const submission = tables.submissions.find((row) => row.id === args.p_submission_id)
        if (submission) {
          submission.status = 'approved'
          submission.moderator_notes = args.p_moderator_notes
          submission.reviewed_at = new Date().toISOString()
        }
        return { data: mandal.slug, error: null }
      }

      throw new Error(`Unhandled fake rpc: ${fnName}`)
    },
  }

  return { tables, client }
}

const fakeDb = createFakeDb()

vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: () => fakeDb.client,
}))

vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '127.0.0.1']]),
}))

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}))

// Image validation and the R2 upload itself are covered by
// photo-upload.test.ts; here only the router glue (photo_data_url in ->
// photo_url out, on both new_mandal and edit_mandal) is under test.
vi.mock('../photo-upload', () => ({
  uploadSubmissionPhoto: async () => 'https://photos.example.com/fake.jpg',
}))

/**
 * Imported here rather than inside each test: pulling in the whole router
 * tree (tRPC, Zod, Supabase, Sentry, Fuse) is the slowest thing this file
 * does, and inside a test body that cost counts against the per-test
 * timeout — which, with the whole suite running in parallel, was enough to
 * blow past it. It still has to be a dynamic import so it resolves after
 * the vi.mock() calls above are hoisted.
 */
const { appRouter } = await import('./_app')

describe('submit → approve → appears in mandals.list', () => {
  beforeEach(() => {
    fakeDb.tables.mandals = []
    fakeDb.tables.submissions = []
    fakeDb.tables.moderators = [{ id: 'membership-1', user_id: 'moderator-1' }]
    vi.clearAllMocks()
  })

  it('carries a new-mandal submission from pending to the public directory', async () => {
    const anonCaller = appRouter.createCaller({ supabase: fakeDb.client as never, user: null })
    const moderatorCaller = appRouter.createCaller({
      supabase: fakeDb.client as never,
      user: { id: 'moderator-1' } as never,
    })

    const created = await anonCaller.submissions.create({
      type: 'new_mandal',
      payload: {
        name: 'Test Tarun Mandal',
        area: 'Test Area',
        location: { kind: 'pin', lat: 19.076, lng: 72.8777 },
        is_public: true,
      },
      confirm_duplicate: false,
      session_id: randomUUID(),
    })
    expect(created.status).toBe('created')
    if (created.status !== 'created') throw new Error('unreachable')

    const pendingQueue = await moderatorCaller.submissions.list({
      status: 'pending',
      page: 1,
      pageSize: 20,
    })
    expect(pendingQueue.items.map((item) => item.id)).toContain(created.submissionId)

    const review = await moderatorCaller.submissions.review({
      submissionId: created.submissionId,
      decision: 'approve',
      moderatorNotes: 'Looks good',
    })
    expect(review.status).toBe('approved')
    expect(review.mandalSlug).toBe('test-tarun-mandal')

    const directory = await anonCaller.mandals.list({ page: 1, pageSize: 24 })
    expect(directory.items.map((mandal) => mandal.slug)).toContain('test-tarun-mandal')

    const stillPending = await moderatorCaller.submissions.list({
      status: 'pending',
      page: 1,
      pageSize: 20,
    })
    expect(stillPending.items.map((item) => item.id)).not.toContain(created.submissionId)
  })

  it('rejects a submission from a non-moderator user', async () => {
    const impostorCaller = appRouter.createCaller({
      supabase: fakeDb.client as never,
      user: { id: 'not-a-moderator' } as never,
    })

    await expect(
      impostorCaller.submissions.list({ status: 'pending', page: 1, pageSize: 20 })
    ).rejects.toThrow()
  })

  it('lets a public reporter flag an issue on an existing mandal, and a moderator approve the fix', async () => {
    fakeDb.tables.mandals.push({
      id: '488769af-20e9-4c7e-8ded-934f4991513c',
      name: 'Existing Mandal',
      slug: 'existing-mandal',
      area: 'Existing Area',
      zone: null,
      lat: 19.05,
      lng: 72.85,
      established_year: null,
      description: null,
      history: null,
      nearest_station: null,
      tags: null,
      timings: null,
      official_contact: null,
      photo_url: null,
      is_public: true,
      source: 'crowdsourced',
      verification_status: 'unverified',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const anonCaller = appRouter.createCaller({ supabase: fakeDb.client as never, user: null })
    const moderatorCaller = appRouter.createCaller({
      supabase: fakeDb.client as never,
      user: { id: 'moderator-1' } as never,
    })

    const created = await anonCaller.submissions.create({
      type: 'edit_mandal',
      payload: {
        mandal_id: '488769af-20e9-4c7e-8ded-934f4991513c',
        message: 'The timings listed are wrong, it closes earlier now.',
        timings: '6 AM – 9 PM',
      },
      session_id: randomUUID(),
    })
    expect(created.status).toBe('created')
    if (created.status !== 'created') throw new Error('unreachable')

    // The queue join (submissions.list) should surface which live mandal
    // this report targets, without the client fetching it separately.
    const pendingQueue = await moderatorCaller.submissions.list({
      status: 'pending',
      page: 1,
      pageSize: 20,
    })
    const queued = pendingQueue.items.find((item) => item.id === created.submissionId)
    expect(queued?.mandal).toEqual({ name: 'Existing Mandal', slug: 'existing-mandal' })
    expect(queued?.payload.reporter_message).toBe(
      'The timings listed are wrong, it closes earlier now.'
    )

    const review = await moderatorCaller.submissions.review({
      submissionId: created.submissionId,
      decision: 'approve',
    })
    expect(review.status).toBe('approved')
    expect(review.mandalSlug).toBe('existing-mandal')

    const updatedMandal = fakeDb.tables.mandals.find(
      (row) => row.id === '488769af-20e9-4c7e-8ded-934f4991513c'
    )
    expect(updatedMandal?.timings).toBe('6 AM – 9 PM')
  })

  it('bulk-reviews a mixed batch, recording each outcome without the batch aborting on one failure', async () => {
    const anonCaller = appRouter.createCaller({ supabase: fakeDb.client as never, user: null })
    const moderatorCaller = appRouter.createCaller({
      supabase: fakeDb.client as never,
      user: { id: 'moderator-1' } as never,
    })

    const first = await anonCaller.submissions.create({
      type: 'new_mandal',
      payload: {
        name: 'Bulk Mandal One',
        area: 'Area One',
        location: { kind: 'pin', lat: 18.9, lng: 72.8 },
        is_public: true,
      },
      confirm_duplicate: false,
      session_id: randomUUID(),
    })
    const second = await anonCaller.submissions.create({
      type: 'new_mandal',
      payload: {
        name: 'Bulk Mandal Two',
        area: 'Area Two',
        location: { kind: 'pin', lat: 19.3, lng: 73.1 },
        is_public: true,
      },
      confirm_duplicate: false,
      session_id: randomUUID(),
    })
    if (first.status !== 'created' || second.status !== 'created') {
      throw new Error('unreachable')
    }

    // Reviewed ahead of time so the batch below hits it as an
    // already-reviewed conflict — the case a moderator can't predict when
    // selecting a page's worth of rows to bulk-approve.
    await moderatorCaller.submissions.review({
      submissionId: first.submissionId,
      decision: 'reject',
    })

    const result = await moderatorCaller.submissions.bulkReview({
      submissionIds: [first.submissionId, second.submissionId],
      decision: 'approve',
    })

    const firstResult = result.results.find((r) => r.submissionId === first.submissionId)
    const secondResult = result.results.find((r) => r.submissionId === second.submissionId)
    expect(firstResult?.status).toBe('error')
    expect(firstResult?.error).toBeTruthy()
    expect(secondResult?.status).toBe('approved')
    expect(secondResult?.mandalSlug).toBe('bulk-mandal-two')

    const directory = await anonCaller.mandals.list({ page: 1, pageSize: 24 })
    expect(directory.items.map((mandal) => mandal.slug)).toContain('bulk-mandal-two')
  })

  it('uploads a reported replacement photo and applies it once the edit is approved', async () => {
    fakeDb.tables.mandals.push({
      id: 'a2f4c8b1-9d3e-4a5f-8b6c-1e2d3f4a5b6c',
      name: 'Photo Mandal',
      slug: 'photo-mandal',
      area: 'Photo Area',
      zone: null,
      lat: 19.05,
      lng: 72.85,
      established_year: null,
      description: null,
      history: null,
      nearest_station: null,
      tags: null,
      timings: null,
      official_contact: null,
      photo_url: null,
      is_public: true,
      source: 'crowdsourced',
      verification_status: 'unverified',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const anonCaller = appRouter.createCaller({ supabase: fakeDb.client as never, user: null })
    const moderatorCaller = appRouter.createCaller({
      supabase: fakeDb.client as never,
      user: { id: 'moderator-1' } as never,
    })

    const created = await anonCaller.submissions.create({
      type: 'edit_mandal',
      payload: {
        mandal_id: 'a2f4c8b1-9d3e-4a5f-8b6c-1e2d3f4a5b6c',
        message: 'The photo on file is outdated, here is a current one.',
        photo_data_url: 'data:image/jpeg;base64,ZmFrZQ==',
      },
      session_id: randomUUID(),
    })
    expect(created.status).toBe('created')
    if (created.status !== 'created') throw new Error('unreachable')

    // uploadSubmissionPhoto is mocked above — this checks submissions.create
    // calls it and stores the resulting URL, not the upload itself.
    const stored = fakeDb.tables.submissions.find((row) => row.id === created.submissionId)
    expect(stored?.payload).toMatchObject({ photo_url: 'https://photos.example.com/fake.jpg' })

    await moderatorCaller.submissions.review({
      submissionId: created.submissionId,
      decision: 'approve',
    })

    const updatedMandal = fakeDb.tables.mandals.find(
      (row) => row.id === 'a2f4c8b1-9d3e-4a5f-8b6c-1e2d3f4a5b6c'
    )
    expect(updatedMandal?.photo_url).toBe('https://photos.example.com/fake.jpg')
  })

  it('lets a moderator correct an edit report before approving, preserving the reporter’s own message', async () => {
    fakeDb.tables.mandals.push({
      id: 'b3a5d9c2-8e4f-4b1a-9c7d-2f6e8a1b4c9d',
      name: 'Correction Mandal',
      slug: 'correction-mandal',
      area: 'Correction Area',
      zone: null,
      lat: 19.05,
      lng: 72.85,
      established_year: null,
      description: null,
      history: null,
      nearest_station: null,
      tags: null,
      timings: null,
      official_contact: null,
      photo_url: null,
      is_public: true,
      source: 'crowdsourced',
      verification_status: 'unverified',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const anonCaller = appRouter.createCaller({ supabase: fakeDb.client as never, user: null })
    const moderatorCaller = appRouter.createCaller({
      supabase: fakeDb.client as never,
      user: { id: 'moderator-1' } as never,
    })

    const created = await anonCaller.submissions.create({
      type: 'edit_mandal',
      payload: {
        mandal_id: 'b3a5d9c2-8e4f-4b1a-9c7d-2f6e8a1b4c9d',
        message: 'The name has a typo.',
        name: 'Correcton Mandall',
      },
      session_id: randomUUID(),
    })
    if (created.status !== 'created') throw new Error('unreachable')

    // The moderator fixes the reporter's own typo before approving.
    await moderatorCaller.submissions.updatePayload({
      type: 'edit_mandal',
      submissionId: created.submissionId,
      payload: { name: 'Correction Mandal Fixed' },
    })

    const stored = fakeDb.tables.submissions.find((row) => row.id === created.submissionId)
    // The reporter's message survives an edit that never touched it.
    expect(stored?.payload).toMatchObject({
      reporter_message: 'The name has a typo.',
      name: 'Correction Mandal Fixed',
    })

    await moderatorCaller.submissions.review({
      submissionId: created.submissionId,
      decision: 'approve',
    })

    const updatedMandal = fakeDb.tables.mandals.find(
      (row) => row.id === 'b3a5d9c2-8e4f-4b1a-9c7d-2f6e8a1b4c9d'
    )
    expect(updatedMandal?.name).toBe('Correction Mandal Fixed')
  })

  it('rejects updatePayload when the input type doesn’t match the submission’s actual type', async () => {
    const anonCaller = appRouter.createCaller({ supabase: fakeDb.client as never, user: null })
    const moderatorCaller = appRouter.createCaller({
      supabase: fakeDb.client as never,
      user: { id: 'moderator-1' } as never,
    })

    const created = await anonCaller.submissions.create({
      type: 'new_mandal',
      payload: {
        name: 'Type Mismatch Mandal',
        area: 'Area',
        location: { kind: 'pin', lat: 19.1, lng: 72.9 },
        is_public: true,
      },
      confirm_duplicate: false,
      session_id: randomUUID(),
    })
    if (created.status !== 'created') throw new Error('unreachable')

    await expect(
      moderatorCaller.submissions.updatePayload({
        type: 'edit_mandal',
        submissionId: created.submissionId,
        payload: { name: 'Should not apply' },
      })
    ).rejects.toThrow()
  })
})
