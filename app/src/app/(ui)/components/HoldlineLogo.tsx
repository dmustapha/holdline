/**
 * Holdline logo — in-house, thesis-encoded (design_forge 4.5b, no external image-gen).
 * Mark = a moon badge (night watch) with a crescent carved out + the "hold line" it defends
 * (the loan-health line that never crosses). Wordmark = Fraunces, the display serif.
 * Renders crisp at any size; the mark alone is legible at 16px.
 */
export function HoldlineMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="Holdline"
      style={{ filter: "drop-shadow(0 8px 30px rgba(108,140,255,0.28))" }}
    >
      <defs>
        <radialGradient
          id="hl-moon"
          cx="13"
          cy="12"
          r="34"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#eaefff" />
          <stop offset="52%" stopColor="#6c8cff" />
          <stop offset="100%" stopColor="#3d55c9" />
        </radialGradient>
      </defs>
      {/* moonlit badge */}
      <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#hl-moon)" />
      {/* crescent bite — a base-dark disc nudged off the upper-right edge */}
      <circle cx="41" cy="4" r="20" fill="#0a0e1a" />
      {/* the held line — the loan-health line Holdline defends, notched into the moon */}
      <rect x="9" y="27.5" width="22" height="3" rx="1.5" fill="#0a0e1a" />
    </svg>
  );
}

export function HoldlineLogo({ markSize = 34 }: { markSize?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
      <HoldlineMark size={markSize} />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: "-0.01em",
          color: "var(--text-hi)",
        }}
      >
        Holdline
      </span>
    </span>
  );
}
