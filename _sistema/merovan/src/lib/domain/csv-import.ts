// CSV import of ad / shop metrics with a configurable column mapping.
// Pure module: parse → map columns → validate each row. Nothing is written here.

export const TARGET_FIELDS = [
  { key: "date", label: "Fecha", required: true },
  { key: "campaign", label: "Campaña", required: true },
  { key: "ad", label: "Anuncio", required: false },
  { key: "impressions", label: "Impresiones", required: true },
  { key: "clicks", label: "Clics", required: true },
  { key: "spend", label: "Gasto (€)", required: true },
  { key: "add_to_cart", label: "Añadir al carrito", required: false },
  { key: "purchases", label: "Compras", required: false },
  { key: "revenue", label: "Ingresos (€)", required: false },
  { key: "video_views", label: "Reproducciones", required: false },
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number]["key"];
export type Mapping = Partial<Record<TargetField, string>>;

// Starting points only: export a real report from each platform and adjust in Marketing → Importar.
export const DEFAULT_MAPPINGS: Record<string, Mapping> = {
  tiktok: {
    date: "Date", campaign: "Campaign name", ad: "Ad name", impressions: "Impressions", clicks: "Clicks (destination)",
    spend: "Cost", add_to_cart: "Adds to cart", purchases: "Purchases", revenue: "Purchase value", video_views: "Video views",
  },
  meta: {
    date: "Day", campaign: "Campaign name", ad: "Ad name", impressions: "Impressions", clicks: "Link clicks",
    spend: "Amount spent (EUR)", add_to_cart: "Adds to cart", purchases: "Purchases", revenue: "Purchases conversion value",
  },
  tiktok_shop: {
    date: "Date", campaign: "Product name", impressions: "Product impressions", clicks: "Product page views",
    spend: "Spend", purchases: "Orders", revenue: "GMV",
  },
};

/** RFC 4180 parser; detects "," or ";" and strips the BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** "1.234,56" / "1,234.56" / "€12.50" / "-" → number (null if empty). */
export function parseNumber(raw: string | undefined): number | null {
  let s = (raw ?? "").trim().replace(/[€$%\s]/g, "");
  if (s === "" || s === "-" || s === "--") return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // The last separator is the decimal one: 1.234,56 or 1,234.56
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", "."); // 1,234 vs 12,50
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, ""); // 1.234.567
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** "2026-11-03" / "03/11/2026" / "2026/11/03" → "2026-11-03". */
export function parseDate(raw: string | undefined): string | null {
  const s = (raw ?? "").trim().slice(0, 10);
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export interface ImportedRow {
  line: number;
  date: string;
  campaign: string;
  ad: string | null;
  impressions: number;
  clicks: number;
  spend_cents: number;
  add_to_cart: number;
  purchases: number;
  revenue_cents: number;
  video_views: number | null;
  product_code: string | null;  // PRD-0001 found in campaign or ad name
  creative_code: string | null; // CRE-0001 found in ad or campaign name
}

const code = (prefix: string, ...texts: (string | null)[]) => {
  for (const t of texts) {
    const m = t?.toUpperCase().match(new RegExp(`${prefix}-\\d{4}`));
    if (m) return m[0];
  }
  return null;
};

export function mapRows(table: string[][], mapping: Mapping) {
  const [header = [], ...data] = table;
  const index = (f: TargetField) => (mapping[f] ? header.findIndex((h) => h.trim().toLowerCase() === mapping[f]!.trim().toLowerCase()) : -1);

  const missing = TARGET_FIELDS.filter((f) => f.required && index(f.key) < 0).map((f) => `${f.label} ("${mapping[f.key] ?? "sin mapear"}")`);
  if (missing.length) return { rows: [] as ImportedRow[], errors: [`Columnas obligatorias no encontradas: ${missing.join(", ")}`] };

  const rows: ImportedRow[] = [];
  const errors: string[] = [];
  data.forEach((cells, i) => {
    const line = i + 2;
    const get = (f: TargetField) => (index(f) >= 0 ? cells[index(f)] : undefined);
    if (/^(total|totales)/i.test((cells[0] ?? "").trim())) return; // summary rows from exports

    const date = parseDate(get("date"));
    const campaign = (get("campaign") ?? "").trim();
    const nums = {
      impressions: parseNumber(get("impressions")) ?? 0,
      clicks: parseNumber(get("clicks")) ?? 0,
      spend: parseNumber(get("spend")) ?? 0,
      add_to_cart: parseNumber(get("add_to_cart")) ?? 0,
      purchases: parseNumber(get("purchases")) ?? 0,
      revenue: parseNumber(get("revenue")) ?? 0,
    };
    const bad = Object.entries(nums).filter(([, v]) => Number.isNaN(v) || v < 0).map(([k]) => k);
    const problems = [
      !date && `fecha "${get("date") ?? ""}" no válida`,
      !campaign && "campaña vacía",
      bad.length && `números no válidos en ${bad.join(", ")}`,
      nums.clicks > nums.impressions && nums.impressions > 0 && "más clics que impresiones",
    ].filter(Boolean);
    if (problems.length) { errors.push(`Línea ${line}: ${problems.join("; ")}`); return; }

    const ad = (get("ad") ?? "").trim() || null;
    const views = parseNumber(get("video_views"));
    rows.push({
      line, date: date!, campaign, ad,
      impressions: Math.round(nums.impressions), clicks: Math.round(nums.clicks),
      spend_cents: Math.round(nums.spend * 100), add_to_cart: Math.round(nums.add_to_cart),
      purchases: Math.round(nums.purchases), revenue_cents: Math.round(nums.revenue * 100),
      video_views: views == null || Number.isNaN(views) ? null : Math.round(views),
      product_code: code("PRD", campaign, ad),
      creative_code: code("CRE", ad, campaign),
    });
  });
  return { rows, errors };
}
