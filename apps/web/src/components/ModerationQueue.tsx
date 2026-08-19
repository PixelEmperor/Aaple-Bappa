'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/react'
import type { Submission, SubmissionStatus } from '@/shared/schemas'

const PAGE_SIZE = 20

const STATUS_TABS: { value: SubmissionStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const buttonClass = 'flex-1 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50'

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

function QueueCard({ submission }: { submission: Submission }) {
  const utils = trpc.useUtils()
  const [notes, setNotes] = useState('')
  const review = trpc.submissions.review.useMutation({
    onSuccess: () => utils.submissions.list.invalidate(),
  })

  const isPending = submission.status === 'pending'
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
      </div>

      <PayloadFields payload={submission.payload} />

      {submission.moderator_notes && (
        <p className="rounded-md bg-surface-2 p-2 text-xs whitespace-pre-wrap text-ink-soft">
          {submission.moderator_notes}
        </p>
      )}

      {isPending && (
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
