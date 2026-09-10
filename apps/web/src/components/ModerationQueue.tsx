'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/react'
import {
  TAGS,
  ZONES,
  type Submission,
  type SubmissionEditablePayload,
  type SubmissionsBulkReviewOutput,
  type SubmissionStatus,
} from '@/shared/schemas'

const PAGE_SIZE = 50
// submissions.bulkReview caps a single call at 50 (see shared/schemas.ts) —
// a larger selection is chunked into calls of this size rather than one big
// one, since each item is a sequential DB round trip server-side.
const BULK_CHUNK_SIZE = 50

const STATUS_TABS: { value: SubmissionStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const buttonClass = 'flex-1 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50'
const inputClass =
  'w-full rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:ring-3 focus:ring-accent-tint focus:outline-none'

function payloadTitle(submission: Submission): string {
  if (submission.type === 'edit_mandal') {
    return submission.mandal ? `Edit: ${submission.mandal.name}` : 'Edit submission'
  }
  const name = submission.payload.name
  return typeof name === 'string' && name.length > 0
    ? name
    : `Submission ${submission.id.slice(0, 8)}`
}

function PayloadFields({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(
    ([, value]) => value !== null && value !== undefined
  )

  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <dt className="font-semibold text-ink-faint">{key}</dt>
          <dd className="truncate">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

type Tag = (typeof TAGS)[number]

// Coerces whatever's in the raw JSONB payload into the editable shape —
// tolerant of missing/malformed fields (e.g. a bulk-imported row) rather
// than throwing, since this only feeds form defaults, not a write.
function toEditableForm(payload: Record<string, unknown>): SubmissionEditablePayload {
  const zone =
    typeof payload.zone === 'string' && (ZONES as readonly string[]).includes(payload.zone)
      ? (payload.zone as SubmissionEditablePayload['zone'])
      : null
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((t): t is Tag => (TAGS as readonly string[]).includes(t))
    : null

  return {
    name: typeof payload.name === 'string' ? payload.name : '',
    area: typeof payload.area === 'string' ? payload.area : '',
    zone,
    lat: typeof payload.lat === 'number' ? payload.lat : 0,
    lng: typeof payload.lng === 'number' ? payload.lng : 0,
    established_year:
      typeof payload.established_year === 'number' ? payload.established_year : null,
    timings: typeof payload.timings === 'string' ? payload.timings : null,
    nearest_station: typeof payload.nearest_station === 'string' ? payload.nearest_station : null,
    description: typeof payload.description === 'string' ? payload.description : null,
    tags,
    official_contact:
      typeof payload.official_contact === 'string' ? payload.official_contact : null,
    is_public: typeof payload.is_public === 'boolean' ? payload.is_public : true,
    photo_url: typeof payload.photo_url === 'string' ? payload.photo_url : null,
  }
}

function EditForm({ submission, onDone }: { submission: Submission; onDone: () => void }) {
  const utils = trpc.useUtils()
  const [form, setForm] = useState<SubmissionEditablePayload>(() =>
    toEditableForm(submission.payload)
  )
  const update = trpc.submissions.updatePayload.useMutation({
    onSuccess: async () => {
      await utils.submissions.list.invalidate()
      onDone()
    },
  })

  function set<K extends keyof SubmissionEditablePayload>(
    key: K,
    value: SubmissionEditablePayload[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleTag(tag: Tag) {
    setForm((prev) => {
      const tags = prev.tags ?? []
      const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
      return { ...prev, tags: next.length > 0 ? next : null }
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Name</span>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Area</span>
          <input
            value={form.area}
            onChange={(e) => set('area', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Zone</span>
          <select
            value={form.zone ?? ''}
            onChange={(e) =>
              set(
                'zone',
                e.target.value ? (e.target.value as SubmissionEditablePayload['zone']) : null
              )
            }
            className={inputClass}
          >
            <option value="">—</option>
            {ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Established year</span>
          <input
            type="number"
            value={form.established_year ?? ''}
            onChange={(e) =>
              set('established_year', e.target.value ? Number(e.target.value) : null)
            }
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Lat</span>
          <input
            type="number"
            step="any"
            value={form.lat}
            onChange={(e) => set('lat', Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Lng</span>
          <input
            type="number"
            step="any"
            value={form.lng}
            onChange={(e) => set('lng', Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Timings</span>
          <input
            value={form.timings ?? ''}
            onChange={(e) => set('timings', e.target.value || null)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Nearest station</span>
          <input
            value={form.nearest_station ?? ''}
            onChange={(e) => set('nearest_station', e.target.value || null)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-faint">Official contact</span>
          <input
            value={form.official_contact ?? ''}
            onChange={(e) => set('official_contact', e.target.value || null)}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_public}
            onChange={(e) => set('is_public', e.target.checked)}
          />
          Public
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-ink-faint">Description</span>
        <textarea
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value || null)}
          rows={3}
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-ink-faint">Tags</span>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={form.tags?.includes(tag) ?? false}
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                form.tags?.includes(tag)
                  ? 'border-accent bg-accent text-white'
                  : 'border-line text-ink-soft hover:border-ink-faint hover:text-ink'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {update.error && (
        <p role="alert" className="text-sm text-crit">
          {update.error.message}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDone}
          disabled={update.isPending}
          className={`${buttonClass} border border-line text-ink-soft hover:border-ink-faint hover:text-ink`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => update.mutate({ submissionId: submission.id, payload: form })}
          disabled={update.isPending}
          className={`${buttonClass} bg-accent text-white hover:bg-accent-deep`}
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

/** Splits an edit_mandal payload's free-text report from its proposed field changes. */
function splitEditReport(payload: Record<string, unknown>) {
  const { reporter_message, ...changes } = payload
  return {
    message: typeof reporter_message === 'string' ? reporter_message : null,
    changes,
  }
}

function QueueCard({
  submission,
  selected,
  onToggleSelected,
}: {
  submission: Submission
  selected: boolean
  onToggleSelected: () => void
}) {
  const utils = trpc.useUtils()
  const [notes, setNotes] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const review = trpc.submissions.review.useMutation({
    onSuccess: () => utils.submissions.list.invalidate(),
  })

  const isPending = submission.status === 'pending'
  const canEdit = isPending && submission.type === 'new_mandal'
  const busyDecision = review.isPending ? review.variables?.decision : undefined
  const editReport = submission.type === 'edit_mandal' ? splitEditReport(submission.payload) : null

  function act(decision: 'approve' | 'reject') {
    review.mutate({
      submissionId: submission.id,
      decision,
      moderatorNotes: notes.trim() || undefined,
    })
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {isPending && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              aria-label={`Select ${payloadTitle(submission)}`}
              className="mt-1 size-4 flex-none"
            />
          )}
          <div>
            <h3 className="font-bold">{payloadTitle(submission)}</h3>
            <p className="text-xs text-ink-faint">
              {submission.type === 'new_mandal' ? 'New mandal' : 'Edit report'} · submitted{' '}
              {new Date(submission.submitted_at).toLocaleString()}
              {submission.submitter_contact ? ` · contact: ${submission.submitter_contact}` : ''}
            </p>
            {submission.type === 'edit_mandal' && submission.mandal && (
              <a
                href={`/mandal/${submission.mandal.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-accent-deep hover:underline"
              >
                View live mandal ↗
              </a>
            )}
          </div>
        </div>
        {canEdit && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex-none text-xs font-bold text-accent-deep hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <EditForm submission={submission} onDone={() => setIsEditing(false)} />
      ) : (
        <>
          {editReport?.message && (
            <p className="rounded-md border border-accent/30 bg-accent-tint p-2 text-sm whitespace-pre-wrap">
              <span className="font-bold">Reporter says: </span>
              {editReport.message}
            </p>
          )}
          <PayloadFields payload={editReport ? editReport.changes : submission.payload} />
        </>
      )}

      {submission.moderator_notes && (
        <p className="rounded-md bg-surface-2 p-2 text-xs whitespace-pre-wrap text-ink-soft">
          {submission.moderator_notes}
        </p>
      )}

      {isPending && !isEditing && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-faint">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:ring-3 focus:ring-accent-tint focus:outline-none"
            />
          </label>

          {review.error && (
            <p role="alert" className="text-sm text-crit">
              {review.error.message}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => act('reject')}
              disabled={review.isPending}
              className={`${buttonClass} border border-line text-ink-soft hover:border-ink-faint hover:text-ink`}
            >
              {busyDecision === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
            <button
              type="button"
              onClick={() => act('approve')}
              disabled={review.isPending}
              className={`${buttonClass} bg-accent text-white hover:bg-accent-deep`}
            >
              {busyDecision === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

type BulkSummary = { approved: number; rejected: number; errors: string[] }

function BulkActionBar({
  status,
  selected,
  totalPending,
  onSelectAllOnPage,
  onSelectAllPending,
  onClear,
}: {
  status: SubmissionStatus
  selected: Set<string>
  totalPending: number
  onSelectAllOnPage: () => void
  onSelectAllPending: () => Promise<void>
  onClear: () => void
}) {
  const utils = trpc.useUtils()
  const [notes, setNotes] = useState('')
  const [summary, setSummary] = useState<BulkSummary | null>(null)
  const [isSelectingAll, setIsSelectingAll] = useState(false)
  const bulkReview = trpc.submissions.bulkReview.useMutation()

  if (status !== 'pending') return null

  async function run(decision: 'approve' | 'reject') {
    setSummary(null)
    const ids = [...selected]
    const outcome: BulkSummary = { approved: 0, rejected: 0, errors: [] }

    for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + BULK_CHUNK_SIZE)
      let results: SubmissionsBulkReviewOutput['results']
      try {
        const response = await bulkReview.mutateAsync({
          submissionIds: chunk,
          decision,
          moderatorNotes: notes.trim() || undefined,
        })
        results = response.results
      } catch (err) {
        outcome.errors.push(err instanceof Error ? err.message : 'Unexpected error')
        continue
      }
      for (const result of results) {
        if (result.status === 'approved') outcome.approved += 1
        else if (result.status === 'rejected') outcome.rejected += 1
        else outcome.errors.push(result.error ?? 'Unknown error')
      }
    }

    setSummary(outcome)
    onClear()
    await utils.submissions.list.invalidate()
  }

  async function selectAllPending() {
    setIsSelectingAll(true)
    try {
      await onSelectAllPending()
    } finally {
      setIsSelectingAll(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent-tint p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-bold">{selected.size} selected</span>
        <button type="button" onClick={onSelectAllOnPage} className="font-semibold hover:underline">
          Select all on this page
        </button>
        <button
          type="button"
          onClick={selectAllPending}
          disabled={isSelectingAll}
          className="font-semibold hover:underline disabled:opacity-50"
        >
          {isSelectingAll ? 'Loading…' : `Select all ${totalPending} pending`}
        </button>
        {selected.size > 0 && (
          <button type="button" onClick={onClear} className="font-semibold hover:underline">
            Clear selection
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-faint">
              Notes applied to every selected item (optional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => run('reject')}
              disabled={bulkReview.isPending}
              className={`${buttonClass} border border-line bg-surface text-ink-soft hover:border-ink-faint hover:text-ink`}
            >
              {bulkReview.isPending ? 'Working…' : `Reject ${selected.size}`}
            </button>
            <button
              type="button"
              onClick={() => run('approve')}
              disabled={bulkReview.isPending}
              className={`${buttonClass} bg-accent text-white hover:bg-accent-deep`}
            >
              {bulkReview.isPending ? 'Working…' : `Approve ${selected.size}`}
            </button>
          </div>
        </>
      )}

      {summary && (
        <p className="text-sm">
          Done — {summary.approved} approved, {summary.rejected} rejected
          {summary.errors.length > 0 ? `, ${summary.errors.length} failed` : ''}.
          {summary.errors.length > 0 && (
            <span className="mt-1 block text-crit">
              {summary.errors.slice(0, 5).join(' · ')}
              {summary.errors.length > 5 ? ` · +${summary.errors.length - 5} more` : ''}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

export function ModerationQueue() {
  const [status, setStatus] = useState<SubmissionStatus>('pending')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const utils = trpc.useUtils()
  const { data, error, isLoading } = trpc.submissions.list.useQuery({
    status,
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  function changeStatus(next: SubmissionStatus) {
    setStatus(next)
    setPage(1)
    setSelected(new Set())
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllOnPage() {
    if (!data) return
    setSelected((prev) => {
      const next = new Set(prev)
      for (const item of data.items) {
        if (item.status === 'pending') next.add(item.id)
      }
      return next
    })
  }

  async function selectAllPending() {
    const result = await utils.submissions.listIds.fetch({ status: 'pending' })
    setSelected(new Set(result.ids))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => changeStatus(tab.value)}
            aria-pressed={status === tab.value}
            className={`rounded-full border px-3 py-1 text-sm font-bold ${
              status === tab.value
                ? 'border-accent bg-accent text-white'
                : 'border-line text-ink-soft hover:border-ink-faint hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-crit-tint px-3 py-2 text-sm text-crit">
          Couldn&apos;t load the queue: {error.message}
        </p>
      )}

      <BulkActionBar
        status={status}
        selected={selected}
        totalPending={data?.total ?? 0}
        onSelectAllOnPage={selectAllOnPage}
        onSelectAllPending={selectAllPending}
        onClear={() => setSelected(new Set())}
      />

      {isLoading ? (
        <p role="status" className="py-12 text-center text-ink-faint">
          Loading…
        </p>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((submission) => (
              <QueueCard
                key={submission.id}
                submission={submission}
                selected={selected.has(submission.id)}
                onToggleSelected={() => toggleSelected(submission.id)}
              />
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="font-semibold hover:underline disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-ink-faint">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="font-semibold hover:underline disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <p role="status" className="py-12 text-center text-ink-faint">
          Nothing here.
        </p>
      )}
    </div>
  )
}
