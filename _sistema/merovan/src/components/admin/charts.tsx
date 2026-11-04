// Lightweight SVG charts for the admin dashboard (server-rendered, no chart library).

const W = 640;
const H = 220;
const PAD = { l: 44, r: 8, t: 10, b: 24 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function Axes({ max, labels, fmt }: { max: number; labels: string[]; fmt: (n: number) => string }) {
  const step = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <g className="text-[10px]" fill="currentColor">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PAD.t + (1 - f) * (H - PAD.t - PAD.b);
        return (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--border)" strokeDasharray={f ? "3 4" : undefined} />
            <text x={PAD.l - 6} y={y + 3} textAnchor="end" className="fill-[var(--muted)]">{fmt(max * f)}</text>
          </g>
        );
      })}
      {labels.map((l, i) => i % step === 0 && (
        <text key={i} x={PAD.l + ((i + 0.5) / labels.length) * (W - PAD.l - PAD.r)} y={H - 6} textAnchor="middle" className="fill-[var(--muted)]">{l}</text>
      ))}
    </g>
  );
}

/** Two series (current vs previous) as smooth-ish lines. */
export function LineChart({ labels, current, previous, fmt, label = "Gráfica" }: {
  labels: string[]; current: number[]; previous: number[]; fmt: (n: number) => string; label?: string;
}) {
  const max = niceMax(Math.max(...current, ...previous, 0));
  const x = (i: number) => PAD.l + ((i + 0.5) / labels.length) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = (s: number[]) => s.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      <Axes max={max} labels={labels} fmt={fmt} />
      <path d={path(previous)} fill="none" stroke="#c9ccd3" strokeWidth="2" strokeLinejoin="round" />
      <path d={`${path(current)} L${x(current.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#area)" opacity="0.5" />
      <path d={path(current)} fill="none" stroke="#111318" strokeWidth="2.2" strokeLinejoin="round" />
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b07d2c" stopOpacity="0.35" /><stop offset="1" stopColor="#b07d2c" stopOpacity="0" /></linearGradient>
      </defs>
    </svg>
  );
}

/** Vertical bars, optional previous-period ghost bars and an average line. */
export function BarChart({ labels, values, previous, fmt, color = "#b07d2c", showAvg = false, label = "Gráfica" }: {
  labels: string[]; values: number[]; previous?: number[]; fmt: (n: number) => string; color?: string; showAvg?: boolean; label?: string;
}) {
  const max = niceMax(Math.max(...values, ...(previous ?? []), 0));
  const slot = (W - PAD.l - PAD.r) / labels.length;
  const bw = Math.max(2, slot * (previous ? 0.32 : 0.55));
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const nonZero = values.filter((v) => v > 0);
  const avg = nonZero.length ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      <Axes max={max} labels={labels} fmt={fmt} />
      {values.map((v, i) => {
        const cx = PAD.l + slot * i + slot / 2;
        return (
          <g key={i}>
            {previous && <rect x={cx - bw - 1} y={y(previous[i] ?? 0)} width={bw} height={y(0) - y(previous[i] ?? 0)} rx="2" fill="#d5d8de" />}
            <rect x={previous ? cx + 1 : cx - bw / 2} y={y(v)} width={bw} height={y(0) - y(v)} rx="2" fill={color}>
              <title>{`${labels[i]}: ${fmt(v)}`}</title>
            </rect>
          </g>
        );
      })}
      {showAvg && avg > 0 && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(avg)} y2={y(avg)} stroke="#111318" strokeDasharray="4 4" />
          <rect x={PAD.l + 2} y={y(avg) - 9} width="34" height="16" rx="4" fill="#111318" />
          <text x={PAD.l + 19} y={y(avg) + 3} textAnchor="middle" fontSize="10" fill="#fff">Media</text>
        </g>
      )}
    </svg>
  );
}

/** Ranked horizontal bars (e.g. best-selling products). */
export function RankBars({ rows, fmt }: { rows: { label: string; value: number }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const palette = ["#b07d2c", "#111318", "#8a8f98", "#d6b26e", "#5b6170"];
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-muted">Aún no hay ventas en este periodo.</p>;
  return (
    <ul className="space-y-4">
      {rows.map((r, i) => (
        <li key={r.label}>
          <p className="flex justify-between text-sm"><span className="truncate font-medium">{r.label}</span><span className="text-muted tabular-nums">{fmt(r.value)}</span></p>
          <div className="mt-1.5 h-2.5 rounded-full bg-background">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: palette[i % palette.length] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "↑ 12 % frente al periodo anterior" chip. */
export function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return <span className="text-xs text-muted">sin datos previos</span>;
  if (before === 0) return <span className="text-xs font-medium text-ok">nuevo</span>;
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-ok" : "text-danger"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1).replace(".", ",")} % <span className="font-normal text-muted">vs periodo anterior</span>
    </span>
  );
}
