"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireRole } from "@/lib/admin";
import { type Mapping, TARGET_FIELDS, mapRows, parseCsv } from "@/lib/domain/csv-import";
import { parseEuros } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const WRITERS = ["owner", "marketing"] as const;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

function done(path: string, kind: "ok" | "error", msg: string): never {
  revalidatePath(path);
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

async function productIdByCode(code: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id").eq("code", code).single();
  return data?.id as string | undefined;
}

// ---------- Creatives ----------
export async function createCreative(formData: FormData) {
  const staff = await requireRole(...WRITERS);
  const path = "/admin/marketing/creatividades";
  const productId = await productIdByCode(str(formData, "product"));
  if (!productId) done(path, "error", "Elige un producto");
  const supabase = await createClient();
  const { data: code } = await supabase.rpc("next_code", { prefix: "CRE" });
  const duration = str(formData, "duration_s");
  const { error } = await supabase.from("creatives").insert({
    code, product_id: productId, hook: str(formData, "hook"), angle: str(formData, "angle"),
    format: str(formData, "format") || "video_vertical", duration_s: duration ? Number(duration) : null,
    platforms: formData.getAll("platforms").map(String), script_id: opt(formData, "script_id"),
    creator_id: opt(formData, "creator_id"), url: opt(formData, "url"),
    contains_ai: formData.get("contains_ai") === "on", sponsored: formData.get("sponsored") === "on", created_by: staff.id,
  });
  if (error) done(path, "error", error.message);
  done(path, "ok", `Creatividad ${code} creada. Usa "${code}" en el nombre del anuncio para cruzar las métricas.`);
}

export async function setCreativeStatus(id: string, formData: FormData) {
  await requireRole(...WRITERS);
  const supabase = await createClient();
  const { error } = await supabase.from("creatives").update({ status: str(formData, "status") }).eq("id", id);
  done("/admin/marketing/creatividades", error ? "error" : "ok", error?.message ?? "Estado actualizado");
}

// ---------- Scripts ----------
export async function createScript(formData: FormData) {
  const staff = await requireRole(...WRITERS);
  const path = "/admin/marketing/guiones";
  const productId = await productIdByCode(str(formData, "product"));
  if (!productId) done(path, "error", "Elige un producto");
  const supabase = await createClient();
  const { data: code } = await supabase.rpc("next_code", { prefix: "GUI" });
  const { error } = await supabase.from("scripts").insert({
    code, product_id: productId, angle: str(formData, "angle"), hook: str(formData, "hook"),
    problem: str(formData, "problem"), demo: str(formData, "demo"), proof: str(formData, "proof"),
    offer: str(formData, "offer"), cta: str(formData, "cta"),
    contains_ai: formData.get("contains_ai") === "on", created_by: staff.id,
  });
  if (error) done(path, "error", error.message);
  done(path, "ok", `Guion ${code} creado`);
}

export async function setScriptStatus(id: string, formData: FormData) {
  await requireRole(...WRITERS);
  const supabase = await createClient();
  const { error } = await supabase.from("scripts").update({ status: str(formData, "status") }).eq("id", id);
  done("/admin/marketing/guiones", error ? "error" : "ok", error?.message ?? "Estado actualizado");
}

// ---------- Creators ----------
export async function createCreator(formData: FormData) {
  await requireRole(...WRITERS);
  const pct = str(formData, "commission_pct");
  const supabase = await createClient();
  const { error } = await supabase.from("creators").insert({
    name: str(formData, "name"), handle: opt(formData, "handle"), platform: str(formData, "platform") || "tiktok",
    contact: opt(formData, "contact"), commission_pct: pct ? Number(pct.replace(",", ".")) / 100 : null, notes: str(formData, "notes"),
  });
  done("/admin/marketing/creadores", error ? "error" : "ok", error?.message ?? "Creador añadido");
}

export async function setCreatorStatus(id: string, formData: FormData) {
  await requireRole(...WRITERS);
  const supabase = await createClient();
  const { error } = await supabase.from("creators").update({ status: str(formData, "status") }).eq("id", id);
  done("/admin/marketing/creadores", error ? "error" : "ok", error?.message ?? "Estado actualizado");
}

// ---------- Campaigns ----------
export async function createCampaign(formData: FormData) {
  await requireRole(...WRITERS);
  const path = "/admin/marketing/campanas";
  let budget: number | null, cap: number | null;
  try {
    budget = parseEuros(formData.get("daily_budget"));
    cap = parseEuros(formData.get("test_cap"));
  } catch (e) {
    done(path, "error", (e as Error).message);
  }
  const productCode = str(formData, "product");
  const supabase = await createClient();
  const { data: code } = await supabase.rpc("next_code", { prefix: "CAM" });
  const { error } = await supabase.from("campaigns").insert({
    code, name: str(formData, "name"), product_id: productCode ? await productIdByCode(productCode) : null,
    platform: str(formData, "platform"), objective: str(formData, "objective") || "ventas",
    daily_budget_cents: budget, test_cap_cents: cap,
    starts_on: opt(formData, "starts_on"), ends_on: opt(formData, "ends_on"), notes: str(formData, "notes"),
  });
  if (error) done(path, "error", error.message);
  await audit("crear_campana", "campaigns", code);
  done(path, "ok", `Campaña ${code} registrada. Nómbrala en la plataforma con "${productCode || "PRD-xxxx"}" para cruzar métricas.`);
}

export async function setCampaignStatus(id: string, formData: FormData) {
  await requireRole(...WRITERS);
  const supabase = await createClient();
  const status = str(formData, "status");
  const { error } = await supabase.from("campaigns").update({ status }).eq("id", id);
  await audit("estado_campana", "campaigns", id, { status });
  done("/admin/marketing/campanas", error ? "error" : "ok", error?.message ?? "Estado actualizado (recuerda: el cambio real se hace en la plataforma)");
}

// ---------- Calendar ----------
export async function addCalendarItem(formData: FormData) {
  await requireRole(...WRITERS);
  const supabase = await createClient();
  const { error } = await supabase.from("content_calendar").insert({
    day: str(formData, "day"), platform: str(formData, "platform"), kind: str(formData, "kind"),
    title: str(formData, "title"), creative_id: opt(formData, "creative_id"),
  });
  done("/admin/marketing/calendario", error ? "error" : "ok", error?.message ?? "Añadido al calendario");
}

export async function toggleCalendarItem(id: string, done_: boolean) {
  await requireRole(...WRITERS);
  const supabase = await createClient();
  await supabase.from("content_calendar").update({ done: !done_ }).eq("id", id);
  revalidatePath("/admin/marketing/calendario");
}

// ---------- Metrics import ----------
export async function saveMapping(platform: string, formData: FormData) {
  await requireRole(...WRITERS);
  const mapping: Mapping = Object.fromEntries(
    TARGET_FIELDS.map((f) => [f.key, str(formData, f.key)]).filter(([, v]) => v),
  );
  const supabase = await createClient();
  const { error } = await supabase.from("import_mappings").upsert({ platform, mapping, updated_at: new Date().toISOString() });
  done(`/admin/marketing/importar`, error ? "error" : "ok", error?.message ?? "Mapeo de columnas guardado");
}

export async function importMetrics(mapping: Mapping, formData: FormData) {
  const path = "/admin/marketing/importar";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) done(path, "error", "Elige un archivo CSV");
  if (file.size > 5 * 1024 * 1024) done(path, "error", "El archivo supera 5 MB");
  await importCsv(str(formData, "platform"), file.name, await file.text(), mapping);
}

/** Development only: imports docs/ejemplos/tiktok-ads-ejemplo.csv through the same code path. */
export async function importSample() {
  if (process.env.NODE_ENV === "production") throw new Error("Solo en desarrollo");
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const text = await readFile(join(process.cwd(), "docs", "ejemplos", "tiktok-ads-ejemplo.csv"), "utf8");
  const { DEFAULT_MAPPINGS } = await import("@/lib/domain/csv-import");
  await importCsv("tiktok", "tiktok-ads-ejemplo.csv", text, DEFAULT_MAPPINGS.tiktok);
}

async function importCsv(platform: string, filename: string, text: string, mapping: Mapping) {
  const staff = await requireRole(...WRITERS);
  const path = "/admin/marketing/importar";
  const file = { name: filename };
  const { rows, errors } = mapRows(parseCsv(text), mapping);
  if (rows.length === 0) done(path, "error", errors[0] ?? "El archivo no tiene filas");

  const supabase = await createClient();
  const codes = (prefix: "product_code" | "creative_code") => [...new Set(rows.map((r) => r[prefix]).filter(Boolean))] as string[];
  const [{ data: products }, { data: creatives }] = await Promise.all([
    supabase.from("products").select("id, code").in("code", codes("product_code")),
    supabase.from("creatives").select("id, code, product_id").in("code", codes("creative_code")),
  ]);
  const productId = (c: string | null) => products?.find((p) => p.code === c)?.id ?? null;
  const creative = (c: string | null) => creatives?.find((x) => x.code === c);

  const days = rows.map((r) => r.date).sort();
  const { data: imp, error: impError } = await supabase.from("metric_imports").insert({
    platform, filename: file.name, rows_ok: rows.length, rows_error: errors.length, errors: errors.slice(0, 100),
    date_from: days[0], date_to: days.at(-1), created_by: staff.id,
  }).select("id").single();
  if (impError) done(path, "error", impError.message);

  const { error } = await supabase.from("ad_metrics_daily").upsert(
    rows.map((r) => ({
      day: r.date, platform, campaign_name: r.campaign, ad_name: r.ad ?? "",
      product_id: productId(r.product_code) ?? creative(r.creative_code)?.product_id ?? null,
      creative_id: creative(r.creative_code)?.id ?? null,
      impressions: r.impressions, clicks: r.clicks, spend_cents: r.spend_cents, add_to_cart: r.add_to_cart,
      purchases: r.purchases, revenue_cents: r.revenue_cents, video_views: r.video_views, import_id: imp!.id,
    })),
    { onConflict: "day,platform,campaign_name,ad_name" },
  );
  if (error) done(path, "error", error.message);
  await audit("importar_metricas", "ad_metrics_daily", imp!.id, { platform, rows: rows.length, errors: errors.length });
  const unlinked = rows.filter((r) => !productId(r.product_code) && !creative(r.creative_code)).length;
  done(path, errors.length ? "error" : "ok",
    `${rows.length} filas importadas${errors.length ? `, ${errors.length} con errores (ver historial)` : ""}` +
    (unlinked ? ` · ${unlinked} sin producto/creatividad: incluye PRD-xxxx o CRE-xxxx en los nombres` : ""));
}
