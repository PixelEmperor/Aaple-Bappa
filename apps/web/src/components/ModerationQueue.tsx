'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/react'
import {
  TAGS,
  ZONES,
  type Submission,
  type SubmissionEditablePayload,
  type SubmissionStatus,
} from '@/shared/schemas'

const PAGE_SIZE = 20

const STATUS_TABS: { value: SubmissionStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const buttonClass = 'flex-1 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50'
const inputClass =
  'w-full rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:ring-3 focus:ring-accent-tint focus:outline-none'

function payloadTitle(submission: Submission): string {
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

function QueueCard({ submission }: { submission: Submission }) {
  const utils = trpc.useUtils()
  const [notes, setNotes] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const review = trpc.submissions.review.useMutation({
    onSuccess: () => utils.submissions.list.invalidate(),
  })

  const isPending = submission.status === 'pending'
  const canEdit = isPending && submission.type === 'new_mandal'
  const busyDecision = review.isPending ? review.variables?.decision : undefined

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
        <div>
          <h3 className="font-bold">{payloadTitle(submission)}</h3>
          <p className="text-xs text-ink-faint">
            {submission.type === 'new_mandal' ? 'New mandal' : 'Edit'} · submitted{' '}
            {new Date(submission.submitted_at).toLocaleString()}
            {submission.submitter_contact ? ` · contact: ${submission.submitter_contact}` : ''}
          </p>
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
        <PayloadFields payload={submission.payload} />
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

export function ModerationQueue() {
  const [status, setStatus] = useState<SubmissionStatus>('pending')
  const { data, error, isLoading } = trpc.submissions.list.useQuery({
    status,
    page: 1,
    pageSize: PAGE_SIZE,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatus(tab.value)}
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

      {isLoading ? (
        <p role="status" className="py-12 text-center text-ink-faint">
          Loading…
        </p>
      ) : data && data.items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.items.map((submission) => (
            <QueueCard key={submission.id} submission={submission} />
          ))}
        </ul>
      ) : (
        <p role="status" className="py-12 text-center text-ink-faint">
          Nothing here.
        </p>
      )}
    </div>
  )
}
