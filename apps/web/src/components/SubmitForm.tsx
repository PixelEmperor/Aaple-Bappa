'use client'

import { useState } from 'react'
import { compressImageToDataUrl } from '@/lib/compress-image'
import { getOrCreateSessionId } from '@/lib/session-id'
import { trpc } from '@/lib/trpc/react'
import { TAGS, type SubmissionsCreateOutput } from '@/shared/schemas'
import MandalPinPicker, { type PinLocation } from './MandalPinPickerIsland'

const TOTAL_STEPS = 3

type FormState = {
  name: string
  area: string
  locationMode: 'pin' | 'address'
  pin: PinLocation | null
  address: string
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
  locationMode: 'pin',
  pin: null,
  address: '',
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
  'w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900'

function step1Valid(form: FormState): boolean {
  if (form.name.trim().length < 2 || form.area.trim().length < 2) return false
  if (form.locationMode === 'pin') return form.pin !== null
  return form.address.trim().length >= 3
}

type DuplicateMatches = Extract<
  SubmissionsCreateOutput,
  { status: 'possible_duplicate' }
>['matches']

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
        location:
          form.locationMode === 'pin' && form.pin
            ? { kind: 'pin', lat: form.pin.lat, lng: form.pin.lng }
            : { kind: 'address', address: form.address.trim() },
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
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-900 dark:bg-green-950">
        <h2 className="text-lg font-semibold text-green-800 dark:text-green-300">
          Thanks — submitted!
        </h2>
        <p className="mt-2 text-sm text-green-700 dark:text-green-400">
          A volunteer will review it before it appears on Aaple Bappa.
        </p>
      </div>
    )
  }

  if (duplicates) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Did you mean one of these?</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          We found {duplicates.length} mandal{duplicates.length > 1 ? 's' : ''} that might already
          be this one.
        </p>
        <ul className="flex flex-col gap-2">
          {duplicates.map((match) => (
            <li
              key={match.id}
              className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
              <div className="font-medium">{match.name}</div>
              <div className="text-zinc-500 dark:text-zinc-400">
                {match.area} · {Math.round(match.distanceMeters)}m away
              </div>
            </li>
          ))}
        </ul>
        {errorMessage && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDuplicates(null)}
            className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Go back and edit
          </button>
          <button
            type="button"
            onClick={handleConfirmNotDuplicate}
            disabled={createSubmission.isPending}
            className="flex-1 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {createSubmission.isPending ? 'Submitting…' : "It's not a duplicate — submit anyway"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        Step {step} of {TOTAL_STEPS}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              Mandal name <span className="text-orange-600">*</span>
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
            <span className="text-sm font-medium">
              Area <span className="text-orange-600">*</span>
            </span>
            <input
              type="text"
              value={form.area}
              onChange={(e) => update('area', e.target.value)}
              className={inputClass}
              placeholder="e.g. Lalbaug"
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Location <span className="text-orange-600">*</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  update('locationMode', form.locationMode === 'pin' ? 'address' : 'pin')
                }
                className="text-xs font-medium text-orange-600 hover:underline"
              >
                {form.locationMode === 'pin' ? "I don't know the exact spot" : 'Drop a pin instead'}
              </button>
            </div>

            {form.locationMode === 'pin' ? (
              <div className="h-64 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                <MandalPinPicker value={form.pin} onChange={(value) => update('pin', value)} />
              </div>
            ) : (
              <input
                type="text"
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                className={inputClass}
                placeholder="Street address, landmark, or area"
              />
            )}
          </div>

          <button
            type="button"
            disabled={!step1Valid(form)}
            onClick={() => setStep(2)}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Everything below is optional — add whatever you know, skip the rest.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Year established</span>
            <input
              type="number"
              value={form.establishedYear}
              onChange={(e) => update('establishedYear', e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Darshan timings</span>
            <input
              type="text"
              value={form.timings}
              onChange={(e) => update('timings', e.target.value)}
              className={inputClass}
              placeholder="e.g. 6 AM – 11 PM"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Nearest railway station</span>
            <input
              type="text"
              value={form.nearestStation}
              onChange={(e) => update('nearestStation', e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className={inputClass}
              rows={3}
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Tags</span>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={form.tags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    form.tags.includes(tag)
                      ? 'border-orange-600 bg-orange-600 text-white'
                      : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Official contact</span>
            <input
              type="text"
              value={form.officialContact}
              onChange={(e) => update('officialContact', e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Photo</span>
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
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-1 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Your name or contact (optional)</span>
            <input
              type="text"
              value={form.submitterContact}
              onChange={(e) => update('submitterContact', e.target.value)}
              className={inputClass}
              placeholder="In case a volunteer has a question — never shown publicly"
            />
          </label>

          <div className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
            <div className="font-medium">{form.name || 'Untitled mandal'}</div>
            <div className="text-zinc-500 dark:text-zinc-400">{form.area}</div>
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createSubmission.isPending}
              className="flex-1 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {createSubmission.isPending ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
