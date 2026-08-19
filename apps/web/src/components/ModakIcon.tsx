/**
 * Modak (Ganesh's sweet) line-art mark (docs/ui-mockup.html), used as the
 * brand mark and as a placeholder motif over mandal photo thumbnails.
 * `detailed` includes the pleat linework; the small brand-mark variant
 * drops it for legibility at ~20px.
 */
export function ModakIcon({
  className,
  detailed = false,
}: {
  className?: string
  detailed?: boolean
}) {
  return (
    <svg viewBox="0 0 100 104" className={className} aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={detailed ? 2.1 : 2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M50 16 C 46 16 37 18 30 25 C 20 34 11 47 11 61 C 11 73 14 83 20 90 Q 24.3 99 28.57 90.5 Q 32.9 99 37.14 90.5 Q 41.4 99 45.71 90.5 Q 50 99 54.29 90.5 Q 58.6 99 62.86 90.5 Q 67.1 99 71.43 90.5 Q 75.7 99 80 90 C 86 83 89 73 89 61 C 89 47 80 34 70 25 C 63 18 54 16 50 16 Z" />
        <path d="M46 22 C 48 17 49 16 50 16" />
        <path d="M54 22 C 52 17 51 16 50 16" />
        <path d="M50 20 L 50 98" />
        {detailed ? (
          <>
            <path d="M49 21 C 46 40 45 64 45.71 89.5" />
            <path d="M47 22 C 39 38 37 60 37.14 89.5" />
            <path d="M45 25 C 30 37 28 58 28.57 89.5" />
            <path d="M51 21 C 54 40 55 64 54.29 89.5" />
            <path d="M53 22 C 61 38 63 60 62.86 89.5" />
            <path d="M55 25 C 70 37 72 58 71.43 89.5" />
            <g strokeWidth={1.6}>
              <path d="M41.5 88 C 40 74 42 60 45 50" />
              <path d="M33 87 C 31 74 33 61 37 52" />
              <path d="M24 84 C 22 73 25 62 30 54" />
              <path d="M58.5 88 C 60 74 58 60 55 50" />
              <path d="M67 87 C 69 74 67 61 63 52" />
              <path d="M76 84 C 78 73 75 62 70 54" />
            </g>
          </>
        ) : (
          <>
            <path d="M48 22 C 44 40 44 64 45.71 89.5" />
            <path d="M45 26 C 32 38 28 60 28.57 89.5" />
            <path d="M52 22 C 56 40 56 64 54.29 89.5" />
            <path d="M55 26 C 68 38 72 60 71.43 89.5" />
          </>
        )}
      </g>
    </svg>
  )
}
