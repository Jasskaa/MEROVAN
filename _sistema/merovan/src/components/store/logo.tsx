// MEROVAN brand mark: a Didone-style "M" (hairline and thick strokes, fine serifs) crossed by the
// signature sweeping line, plus a spaced wordmark. Pure SVG, crisp at any size.

const GOLD = ["#F6EBD2", "#D9BC86", "#9E7A42"];

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-g`} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor={GOLD[0]} />
        <stop offset="0.5" stopColor={GOLD[1]} />
        <stop offset="1" stopColor={GOLD[2]} />
      </linearGradient>
    </defs>
  );
}

/** The monogram alone (square). */
export function Monogram({ size = 40, className = "", id = "mv" }: { size?: number; className?: string; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="MEROVAN">
      <Defs id={id} />
      <g fill={`url(#${id}-g)`}>
        <path d="M15.4 15h1.3v32.2h-1.3z" />                 {/* left stem (hairline) */}
        <path d="M15.6 15h6.2l12.4 28.6-2.5 5.4z" />         {/* left diagonal (thick) */}
        <path d="M31.3 48.6 47.4 15h1.4L32.6 49z" />         {/* right diagonal (hairline) */}
        <path d="M44.6 15h5.6v32.2h-5.6z" />                 {/* right stem (thick) */}
        <path d="M11.8 47.2h8.6v1.1h-8.6zM41.6 47.2h11.6v1.1H41.6zM41.6 14h11.6v1.1H41.6zM12.6 14h9.2v1.1h-9.2z" /> {/* serifs */}
      </g>
      {/* signature sweep */}
      <path d="M6 52.5C20 50.5 33 41 42 28.5 46 23 50.5 19.5 58 17" fill="none" stroke={`url(#${id}-g)`} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Horizontal lock-up: monogram + wordmark. */
export function Logo({ tone = "light", size = 32, className = "" }: { tone?: "light" | "dark"; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Monogram size={size} id={`mv-${tone}-${size}`} />
      <span className={`font-serif font-semibold tracking-[0.34em] ${tone === "light" ? "text-[#F3EBDD]" : "text-ink"}`} style={{ fontSize: size * 0.52 }}>
        MEROVAN
      </span>
    </span>
  );
}
