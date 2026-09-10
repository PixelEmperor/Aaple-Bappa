'use client'

import { useEffect, useState } from 'react'
import { compressImageToDataUrl } from '@/lib/compress-image'
import { getOrCreateSessionId } from '@/lib/session-id'
import { trpc } from '@/lib/trpc/react'
import { ZONES, type Mandal } from '@/shared/schemas'

type MandalSummary = Pick<
  Mandal,
  | 'id'
  | 'name'
  | 'area'
  | 'zone'
  | 'established_year'
  | 'timings'
  | 'nearest_station'
  | 'description'
  | 'official_contact'
  | 'photo_url'
>

type FormState = {
  message: string
  name: string
  area: string
  zone: string
  establishedYear: string
  timings: string
  nearestStation: string
  description: string
  officialContact: string
  hidePublicly: boolean
  photoFile: File | null
  submitterContact: string
}

const INITIAL_STATE: FormState = {
  message: '',
  name: '',
  area: '',
  zone: '',
  establishedYear: '',
  timings: '',
  nearestStation: '',
  description: '',
  officialContact: '',
  hidePublicly: false,
  photoFile: null,
  submitterContact: '',
}

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:ring-3 focus:ring-accent-tint focus:outline-none'
const primaryButtonClass =
  'flex-1 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-50'
const ghostButtonClass =
  'flex-1 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:border-ink-faint hover:text-ink'

// Only fields the reporter actually typed something into are sent — an
// empty field means "no opinion", not "clear this value" (see
// editMandalPayloadSchema in shared/schemas.ts, which treats a present key
// as a proposed override).
function buildChanges(form: FormState) {
  const changes: Record<string, string | number | boolean> = {}
  if (form.name.trim()) changes.name = form.name.trim()
  if (form.area.trim()) changes.area = form.area.trim()
  if (form.zone) changes.zone = form.zone
  if (form.establishedYear.trim()) changes.established_year = Number(form.establishedYear)
  if (form.timings.trim()) changes.timings = form.timings.trim()
  if (form.nearestStation.trim()) changes.nearest_station = form.nearestStation.trim()
  if (form.description.trim()) changes.description = form.description.trim()
  if (form.officialContact.trim()) changes.official_contact = form.officialContact.trim()
  if (form.hidePublicly) changes.is_public = false
  return changes
}

export function ReportMandalIssueForm({ mandal }: { mandal: MandalSummary }) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCorrections, setShowCorrections] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const createSubmission = trpc.submissions.create.useMutation()

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // The native file input alone gives no feedback that a file actually
  // attached — this was the reported "upload doesn't seem to work": there was
  // nothing on screen distinguishing "picked a file" from "picked nothing".
  // A visible thumbnail of what's about to be sent removes that doubt.
  function handlePhotoChange(file: File | null) {
    update('photoFile', file)
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
  }

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    }
    // Only cleans up on unmount — handlePhotoChange revokes the previous URL
    // itself whenever a new one replaces it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit() {
    setErrorMessage(null)
    try {
      const photoDataUrl = form.photoFile ? await compressImageToDataUrl(form.photoFile) : undefined

      await createSubmission.mutateAsync({
        type: 'edit_mandal',
        payload: {
          mandal_id: mandal.id,
          message: form.message.trim(),
          ...buildChanges(form),
          photo_data_url: photoDataUrl,
        },
        submitter_contact: form.submitterContact.trim() || undefined,
        session_id: getOrCreateSessionId(),
      })
      setSubmitted(true)
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      )
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-sm font-semibold text-accent-deep hover:underline"
      >
        Report an issue / suggest an edit
      </button>
    )
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-good bg-good-tint p-4 text-center">
        <h2 className="font-bold text-good">Thanks — sent!</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A volunteer will review it before anything changes on the live page.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Report an issue / suggest an edit</h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-sm text-ink-faint hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">
          What&apos;s wrong, or what should change? <span className="text-accent-deep">*</span>
        </span>
        <textarea
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="e.g. the timings are wrong, this mandal moved, this listing is a duplicate…"
        />
      </label>

      {/* Always visible, not tucked behind "Suggest specific corrections" —
          a photo is the single most useful thing a reporter can attach, and
          hiding it behind an extra click meant most people never saw it. */}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">
          Have a photo of the mandal? You can upload one here (optional)
        </span>
        {mandal.photo_url && !photoPreviewUrl && (
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <span>Current photo:</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- small preview, not worth next/image's remote-pattern config for a photo about to be replaced */}
            <img
              src={mandal.photo_url}
              alt="Current"
              className="h-16 w-24 rounded-md border border-line object-cover"
            />
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
          className={inputClass}
        />
        {photoPreviewUrl && form.photoFile && (
          <div className="flex items-center gap-2 rounded-md border border-good/40 bg-good-tint p-2 text-xs">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object: URL preview, next/image can't optimize it anyway */}
            <img
              src={photoPreviewUrl}
              alt="Selected"
              className="h-16 w-24 rounded-md border border-line object-cover"
            />
            <span className="text-good">
              Attached: {form.photoFile.name} — this will replace the current photo once approved.
            </span>
          </div>
        )}
      </label>

      {!showCorrections ? (
        <button
          type="button"
          onClick={() => setShowCorrections(true)}
          className="self-start text-sm font-semibold text-accent-deep hover:underline"
        >
          + Suggest specific corrections
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3">
          <p className="text-xs text-ink-soft">
            Leave anything you&apos;re not sure about blank — only fields you fill in are proposed
            as changes.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-faint">
                Name (currently: {mandal.name})
              </span>
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-faint">
                Area (currently: {mandal.area})
              </span>
              <input
                value={form.area}
                onChange={(e) => update('area', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-faint">
                Zone (currently: {mandal.zone ?? '—'})
              </span>
              <select
                value={form.zone}
                onChange={(e) => update('zone', e.target.value)}
                className={inputClass}
              >
                <option value="">No change</option>
                {ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-faint">
                Established year (currently: {mandal.established_year ?? 'not confirmed'})
              </span>
              <input
                type="number"
                value={form.establishedYear}
                onChange={(e) => update('establishedYear', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-faint">
                Timings (currently: {mandal.timings ?? '—'})
              </span>
              <input
                value={form.timings}
                onChange={(e) => update('timings', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-faint">
                Nearest station (currently: {mandal.nearest_station ?? '—'})
              </span>
              <input
                value={form.nearestStation}
                onChange={(e) => update('nearestStation', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-faint">
                Official contact (currently: {mandal.official_contact ?? '—'})
              </span>
              <input
                value={form.officialContact}
                onChange={(e) => update('officialContact', e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-faint">
              Description (currently: {mandal.description ?? '—'})
            </span>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              rows={2}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.hidePublicly}
              onChange={(e) => update('hidePublicly', e.target.checked)}
            />
            This shouldn&apos;t be listed publicly (e.g. a private/society Ganpati)
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Your name or contact (optional)</span>
        <input
          value={form.submitterContact}
          onChange={(e) => update('submitterContact', e.target.value)}
          className={inputClass}
          placeholder="In case a volunteer has a question — never shown publicly"
        />
      </label>

      {errorMessage && (
        <p role="alert" className="text-sm text-crit">
          {errorMessage}
        </p>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={() => setIsOpen(false)} className={ghostButtonClass}>
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={createSubmission.isPending || form.message.trim().length < 3}
          className={primaryButtonClass}
        >
          {createSubmission.isPending ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </div>
  )
}
