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

describe('submit → approve → appears in mandals.list', () => {
  beforeEach(() => {
    fakeDb.tables.mandals = []
    fakeDb.tables.submissions = []
    fakeDb.tables.moderators = [{ id: 'membership-1', user_id: 'moderator-1' }]
    vi.clearAllMocks()
  })

  it('carries a new-mandal submission from pending to the public directory', async () => {
    const { appRouter } = await import('./_app')

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
    const { appRouter } = await import('./_app')
    const impostorCaller = appRouter.createCaller({
      supabase: fakeDb.client as never,
      user: { id: 'not-a-moderator' } as never,
    })

    await expect(
      impostorCaller.submissions.list({ status: 'pending', page: 1, pageSize: 20 })
    ).rejects.toThrow()
  })
})
