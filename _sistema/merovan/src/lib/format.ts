export const eur = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export const eurFloat = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

/** "19,95" / "19.95" / "1.299,00" → 1995 cents. Empty → null. */
export function parseEuros(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim().replace(/\s|€/g, "");
  if (!s) return null;
  const normalised = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalised);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Importe no válido: ${s}`);
  return Math.round(n * 100);
}

export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");

export const date = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid" }).format(new Date(iso)) : "—";

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
