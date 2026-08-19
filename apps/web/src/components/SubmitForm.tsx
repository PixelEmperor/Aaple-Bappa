'use client'

import { useState } from 'react'
import { compressImageToDataUrl } from '@/lib/compress-image'
import { getOrCreateSessionId } from '@/lib/session-id'
import { trpc } from '@/lib/trpc/react'
import { TAGS, type SubmissionLocation, type SubmissionsCreateOutput } from '@/shared/schemas'
import MandalPinPicker, { type PinLocation } from './MandalPinPickerIsland'

const STEP_LABELS = ['Basics', 'Details & photo', 'Review']

type FormState = {
  name: string
  area: string
  pin: PinLocation | null
  address: string
  googleMapsUrl: string
  establishedYear: string
  timings: string
  nearestStation: string
  description: string
  tags: string[]
  officialContact: string
  isPublic: boolean
  photoFile: File | null
  submitterContact: string
}

const INITIAL_STATE: FormState = {
  name: '',
  area: '',
  pin: null,
  address: '',
  googleMapsUrl: '',
  establishedYear: '',
  timings: '',
  nearestStation: '',
  description: '',
  tags: [],
  officialContact: '',
  isPublic: true,
  photoFile: null,
  submitterContact: '',
}

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:ring-3 focus:ring-accent-tint focus:outline-none'
const primaryButtonClass =
  'flex-1 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-50'
const ghostButtonClass =
  'flex-1 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:border-ink-faint hover:text-ink'

function hasLocation(form: FormState): boolean {
  return (
    form.pin !== null || form.address.trim().length >= 3 || form.googleMapsUrl.trim().length > 0
  )
}

function step1Valid(form: FormState): boolean {
  return form.name.trim().length >= 2 && form.area.trim().length >= 2 && hasLocation(form)
}

// Pin is the most precise (no geocoding/link-resolution needed server-side);
// a Maps link still names an exact point, so it outranks a typed address,
// which needs Nominatim to guess at one. Any combination of the three can be
// filled in — this just decides which one wins if more than one is.
function locationPayload(form: FormState): SubmissionLocation {
  if (form.pin) {
    return { kind: 'pin', lat: form.pin.lat, lng: form.pin.lng }
  }
  if (form.googleMapsUrl.trim()) {
    return { kind: 'google_maps_link', url: form.googleMapsUrl.trim() }
  }
  return { kind: 'address', address: form.address.trim() }
}

type DuplicateMatches = Extract<
  SubmissionsCreateOutput,
  { status: 'possible_duplicate' }
>['matches']

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {STEP_LABELS.map((label, index) => {
        const num = index + 1
        const done = num < step
        const active = num === step
        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold ${
                  done
                    ? 'border-good bg-good text-white'
                    : active
                      ? 'border-accent bg-accent text-white'
                      : 'border-line bg-surface-2 text-ink-faint'
                }`}
              >
                {done ? '✓' : num}
              </span>
              <span className={`text-sm font-semibold ${active ? 'text-ink' : 'text-ink-faint'}`}>
                {label}
              </span>
            </div>
            {num < STEP_LABELS.length && <span className="h-px w-6 bg-line" />}
          </div>
        )
      })}
    </div>
  )
}

export function SubmitForm() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [duplicates, setDuplicates] = useState<DuplicateMatches | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const createSubmission = trpc.submissions.create.useMutation()

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleTag(tag: string) {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }))
  }

  async function submit(confirmDuplicate: boolean) {
    setErrorMessage(null)

    const photoDataUrl = form.photoFile ? await compressImageToDataUrl(form.photoFile) : undefined

    const result = await createSubmission.mutateAsync({
      type: 'new_mandal',
      payload: {
        name: form.name.trim(),
        area: form.area.trim(),
        location: locationPayload(form),
        established_year: form.establishedYear ? Number(form.establishedYear) : undefined,
        timings: form.timings.trim() || undefined,
        nearest_station: form.nearestStation.trim() || undefined,
        description: form.description.trim() || undefined,
        tags: form.tags.length > 0 ? (form.tags as (typeof TAGS)[number][]) : undefined,
        official_contact: form.officialContact.trim() || undefined,
        is_public: form.isPublic,
        photo_data_url: photoDataUrl,
      },
      submitter_contact: form.submitterContact.trim() || undefined,
      confirm_duplicate: confirmDuplicate,
      session_id: getOrCreateSessionId(),
    })

    if (result.status === 'possible_duplicate') {
      setDuplicates(result.matches)
    } else {
      setSubmissionId(result.submissionId)
    }
  }

  function handleSubmit() {
    submit(false).catch((err: unknown) => {
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      )
    })
  }

  function handleConfirmNotDuplicate() {
    submit(true).catch((err: unknown) => {
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      )
    })
  }

  if (submissionId) {
    return (
      <div className="rounded-lg border border-good bg-good-tint p-6 text-center">
        <h2 className="text-lg font-bold text-good">Thanks — submitted!</h2>
        <p className="mt-2 text-sm text-ink-soft">
          A volunteer will review it before it appears on Aaple Bappa.
        </p>
      </div>
    )
  }

  if (duplicates) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 rounded-md border border-warn/40 bg-warn-tint p-4">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="mt-0.5 flex-none text-warn"
          >
            <path
              d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <h2 className="text-sm font-bold">Did you mean one of these?</h2>
            <p className="mt-1 text-sm text-ink-soft">
              We found {duplicates.length} mandal{duplicates.length > 1 ? 's' : ''} that might
              already be this one.
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {duplicates.map((match) => (
            <li key={match.id} className="rounded-md border border-line bg-surface p-3 text-sm">
              <div className="font-semibold">{match.name}</div>
              <div className="text-ink-soft">
                {match.area} · {Math.round(match.distanceMeters)}m away
              </div>
            </li>
          ))}
        </ul>
        {errorMessage && (
          <p role="alert" className="text-sm text-crit">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={() => setDuplicates(null)} className={ghostButtonClass}>
            Go back and edit
          </button>
          <button
            type="button"
            onClick={handleConfirmNotDuplicate}
            disabled={createSubmission.isPending}
            className={primaryButtonClass}
          >
            {createSubmission.isPending ? 'Submitting…' : "It's not a duplicate — submit anyway"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator step={step} />

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              Mandal name <span className="text-accent-deep">*</span>
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className={inputClass}
              placeholder="e.g. Lalbaugcha Raja"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              Area <span className="text-accent-deep">*</span>
            </span>
            <input
              type="text"
              value={form.area}
              onChange={(e) => update('area', e.target.value)}
              className={inputClass}
              placeholder="e.g. Lalbaug"
            />
          </label>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold">
              Location <span className="text-accent-deep">*</span>
            </span>
            <p className="-mt-1 text-xs text-ink-faint">
              Give us at least one of the three below — a dropped pin is the most accurate, but any
              one works.
            </p>

            <div className="h-64 overflow-hidden rounded-lg border border-dashed border-accent">
              <MandalPinPicker value={form.pin} onChange={(value) => update('pin', value)} />
            </div>

            <div className="flex items-center gap-3 text-xs font-bold text-ink-faint uppercase">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft">Type an address</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                className={inputClass}
                placeholder="Street address, landmark, or area"
              />
            </label>

            <div className="flex items-center gap-3 text-xs font-bold text-ink-faint uppercase">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft">Paste a Google Maps link</span>
              <input
                type="url"
                value={form.googleMapsUrl}
                onChange={(e) => update('googleMapsUrl', e.target.value)}
                className={inputClass}
                placeholder="https://maps.google.com/... or https://maps.app.goo.gl/..."
              />
              <span className="text-xs text-ink-faint">
                From the Google Maps app&apos;s Share button.
              </span>
            </label>
          </div>

          <button
            type="button"
            disabled={!step1Valid(form)}
            onClick={() => setStep(2)}
            className={primaryButtonClass}
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Everything below is optional — add whatever you know, skip the rest.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Year established</span>
            <input
              type="number"
              value={form.establishedYear}
              onChange={(e) => update('establishedYear', e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Darshan timings</span>
            <input
              type="text"
              value={form.timings}
              onChange={(e) => update('timings', e.target.value)}
              className={inputClass}
              placeholder="e.g. 6 AM – 11 PM"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Nearest railway station</span>
            <input
              type="text"
              value={form.nearestStation}
              onChange={(e) => update('nearestStation', e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className={inputClass}
              rows={3}
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Tags</span>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={form.tags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    form.tags.includes(tag)
                      ? 'border-accent bg-accent text-white'
                      : 'border-line text-ink-soft hover:border-ink-faint hover:text-ink'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Official contact</span>
            <input
              type="text"
              value={form.officialContact}
              onChange={(e) => update('officialContact', e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Photo</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => update('photoFile', e.target.files?.[0] ?? null)}
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(e) => update('isPublic', e.target.checked)}
            />
            Show this mandal publicly (uncheck for a private/society Ganpati you&apos;d rather keep
            off the map)
          </label>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className={ghostButtonClass}>
              Back
            </button>
            <button type="button" onClick={() => setStep(3)} className={primaryButtonClass}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Your name or contact (optional)</span>
            <input
              type="text"
              value={form.submitterContact}
              onChange={(e) => update('submitterContact', e.target.value)}
              className={inputClass}
              placeholder="In case a volunteer has a question — never shown publicly"
            />
          </label>

          <div className="rounded-md border border-line bg-surface-2 p-3 text-sm">
            <div className="font-semibold">{form.name || 'Untitled mandal'}</div>
            <div className="text-ink-soft">{form.area}</div>
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm text-crit">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(2)} className={ghostButtonClass}>
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createSubmission.isPending}
              className={primaryButtonClass}
            >
              {createSubmission.isPending ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
