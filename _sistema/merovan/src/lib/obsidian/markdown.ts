// Obsidian note handling: a small YAML-frontmatter reader/writer (the subset our templates use)
// and the "automatic zone" that the app may regenerate. Text outside the markers is never touched.

export const AUTO_START = "<!-- merovan:auto:start -->";
export const AUTO_END = "<!-- merovan:auto:end -->";

const APP_TAG_PREFIXES = ["producto/estado/", "decision/"];

export type FrontValue = string | number | boolean | null | string[];
export type Frontmatter = Record<string, FrontValue>;

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseScalar(raw: string): FrontValue {
  const v = raw.trim();
  if (v === "" || v === "null" || v === "~") return null;
  if (v === "true" || v === "false") return v === "true";
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    return v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  return v.replace(/^["']|["']$/g, "");
}

export function parseNote(text: string): { front: Frontmatter; body: string; hasFront: boolean } {
  const m = text.match(FM);
  if (!m) return { front: {}, body: text, hasFront: false };
  const front: Frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):(.*)$/);
    if (kv) front[kv[1]] = parseScalar(kv[2]);
  }
  return { front, body: text.slice(m[0].length), hasFront: true };
}

function formatScalar(v: FrontValue): string {
  if (v == null) return "";
  if (Array.isArray(v)) return `[${v.join(", ")}]`;
  const s = String(v);
  return /[:#\[\]{}]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
}

export function serializeFront(front: Frontmatter): string {
  return `---\n${Object.entries(front).map(([k, v]) => `${k}: ${formatScalar(v)}`.trimEnd()).join("\n")}\n---\n`;
}

/** Replaces (or appends) the automatic zone. Everything else in the body is kept byte for byte. */
export function mergeAutoZone(body: string, auto: string, heading = "## Datos de la app"): string {
  const block = `${AUTO_START}\n${auto.trim()}\n${AUTO_END}`;
  const start = body.indexOf(AUTO_START);
  const end = body.indexOf(AUTO_END);
  if (start >= 0 && end > start) return body.slice(0, start) + block + body.slice(end + AUTO_END.length);
  return `${body.replace(/\s*$/, "")}\n\n${heading}\n${block}\n`;
}

/**
 * Builds the new note text from the existing one. `managed` frontmatter keys are overwritten,
 * the rest are kept. `actualizado` only changes when something else changed, so exporting
 * twice in a row produces no diff.
 */
export function updateNote(existing: string | null, managed: Frontmatter, auto: string, today: string, fallbackBody = "") {
  const { front, body } = existing ? parseNote(existing) : { front: {} as Frontmatter, body: fallbackBody };
  const merged: Frontmatter = { ...front, ...managed };
  if (!("creado" in front)) merged.creado = today;
  if (merged.responsable == null || merged.responsable === "") merged.responsable = "owner";
  merged.actualizado = front.actualizado ?? today;

  // Tags: the app owns only its own prefixes; tags people added by hand are kept.
  if (Array.isArray(managed.tags)) {
    const own = Array.isArray(front.tags) ? front.tags.filter((t) => !APP_TAG_PREFIXES.some((p) => t.startsWith(p))) : [];
    merged.tags = [...new Set([...own, ...managed.tags])];
  }

  const draft = serializeFront(merged) + mergeAutoZone(body, auto);
  if (existing !== null && draft === existing) return { text: existing, changed: false };
  merged.actualizado = today;
  const text = serializeFront(merged) + mergeAutoZone(body, auto);
  return { text, changed: existing === null || text !== existing };
}

/** ISO-8601 week: 2026-11-04 → { year: 2026, week: 45 }. */
export function isoWeek(dateIso: string) {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7) };
}

/** Markdown table from rows (cells escaped for pipes). */
export function mdTable(head: string[], rows: (string | number)[][]) {
  const esc = (c: string | number) => String(c).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
}
