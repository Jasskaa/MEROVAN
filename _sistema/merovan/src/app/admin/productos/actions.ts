"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireRole } from "@/lib/admin";
import { CRITERIA, LEGAL_CHECKS, type LegalValue, type Status, scoreTotal, statusLabel } from "@/lib/domain/product";
import { parseEuros, slugify } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const EDITORS = ["owner", "producto"] as const;
const page = (code: string) => `/admin/productos/${code}`;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Redirect back to the product page with a message (shown as a banner). */
function back(code: string, kind: "ok" | "error", msg: string, anchor = ""): never {
  revalidatePath(page(code));
  redirect(`${page(code)}?${kind}=${encodeURIComponent(msg)}${anchor}`);
}

async function productId(code: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id").eq("code", code).single();
  if (!data) throw new Error(`Producto ${code} no encontrado`);
  return { supabase, id: data.id as string };
}

export async function createProduct(formData: FormData) {
  await requireRole(...EDITORS);
  const name = str(formData, "name");
  if (name.length < 2) redirect("/admin/productos?error=" + encodeURIComponent("Escribe un nombre"));

  const supabase = await createClient();
  const { data: code } = await supabase.rpc("next_code", { prefix: "PRD" });
  const slug = `${slugify(name)}-${String(code).slice(4)}`;
  const { error } = await supabase.from("products").insert({ code, name, slug, status: "idea" });
  if (error) redirect("/admin/productos?error=" + encodeURIComponent(error.message));
  await audit("crear_producto", "products", code, { name });
  redirect(page(code));
}

export async function saveBasics(code: string, formData: FormData) {
  await requireRole(...EDITORS);
  let price: number | null, compareAt: number | null;
  try {
    price = parseEuros(formData.get("price"));
    compareAt = parseEuros(formData.get("compare_at"));
  } catch (e) {
    back(code, "error", (e as Error).message, "#datos");
  }
  const weight = str(formData, "weight_g");
  const { supabase, id } = await productId(code);
  const { error } = await supabase
    .from("products")
    .update({
      name: str(formData, "name"),
      niche: str(formData, "niche") || null,
      description: str(formData, "description"),
      bullets: str(formData, "bullets").split("\n").map((b) => b.trim()).filter(Boolean),
      price_cents: price,
      compare_at_cents: compareAt,
      weight_g: weight ? Number(weight) : null,
      origin_country: str(formData, "origin_country") || null,
      gpsr_manufacturer: str(formData, "gpsr_manufacturer") || null,
      gpsr_address: str(formData, "gpsr_address") || null,
      gpsr_contact: str(formData, "gpsr_contact") || null,
      gpsr_warnings: str(formData, "gpsr_warnings") || null,
    })
    .eq("id", id);
  if (error) back(code, "error", error.message, "#datos");
  back(code, "ok", "Datos guardados", "#datos");
}

export async function saveScorecard(code: string, formData: FormData) {
  await requireRole(...EDITORS);
  const detail = Object.fromEntries(CRITERIA.map(({ key }) => [key, Number(formData.get(key) ?? 0)]));
  const { supabase, id } = await productId(code);
  const { error } = await supabase
    .from("products")
    .update({ score_detail: detail, score: Math.round(scoreTotal(detail)) })
    .eq("id", id);
  if (error) back(code, "error", error.message, "#scorecard");
  back(code, "ok", "Puntuación guardada", "#scorecard");
}

export async function saveLegal(code: string, formData: FormData) {
  await requireRole(...EDITORS);
  const checks = Object.fromEntries(
    LEGAL_CHECKS.map(({ key }) => [key, (formData.get(key) as LegalValue) ?? "pendiente"]),
  );
  const { supabase, id } = await productId(code);
  const { error } = await supabase.from("products").update({ legal_checks: checks }).eq("id", id);
  if (error) back(code, "error", error.message, "#legal");
  await audit("checklist_legal", "products", code, checks);
  back(code, "ok", "Checklist legal guardado", "#legal");
}

export async function changeStatus(code: string, formData: FormData) {
  const staff = await requireRole(...EDITORS);
  const to = str(formData, "to") as Status;
  const reason = str(formData, "reason");
  const exception = str(formData, "sample_exception");
  if (reason.length < 3) back(code, "error", "Explica el motivo del cambio de estado", "#estado");

  const { supabase, id } = await productId(code);
  const { data: current } = await supabase.from("products").select("status").eq("id", id).single();
  const { error } = await supabase
    .from("products")
    .update({ status: to, ...(exception ? { sample_exception: exception } : {}) })
    .eq("id", id);
  if (error) back(code, "error", `No se puede pasar a "${statusLabel(to)}": ${error.message}`, "#estado");

  await supabase.from("status_history").insert({
    product_id: id, from_status: current?.status, to_status: to, reason, changed_by: staff.id,
  });
  await audit("cambio_estado", "products", code, { from: current?.status, to, reason, exception: exception || undefined });
  back(code, "ok", `Estado cambiado a "${statusLabel(to)}"`, "#estado");
}

export async function addVariant(code: string, formData: FormData) {
  await requireRole(...EDITORS);
  let price: number | null;
  try {
    price = parseEuros(formData.get("price"));
  } catch (e) {
    back(code, "error", (e as Error).message, "#variantes");
  }
  const { supabase, id } = await productId(code);
  const { error } = await supabase.from("product_variants").insert({
    product_id: id,
    sku: str(formData, "sku").toUpperCase(),
    title: str(formData, "title") || "Única",
    price_cents: price,
    stock: Number(str(formData, "stock") || 0),
  });
  if (error) back(code, "error", error.code === "23505" ? "Ese SKU ya existe" : error.message, "#variantes");
  back(code, "ok", "Variante añadida", "#variantes");
}

export async function deleteVariant(code: string, variantId: string) {
  await requireRole(...EDITORS);
  const supabase = await createClient();
  const { error } = await supabase.from("product_variants").delete().eq("id", variantId);
  if (error) back(code, "error", "No se puede borrar: la variante tiene pedidos", "#variantes");
  back(code, "ok", "Variante eliminada", "#variantes");
}

export async function registerMedia(code: string, storagePath: string, kind: "image" | "video") {
  await requireRole("owner", "producto", "marketing");
  const { supabase, id } = await productId(code);
  const { count } = await supabase.from("product_media").select("*", { count: "exact", head: true }).eq("product_id", id);
  const { error } = await supabase
    .from("product_media")
    .insert({ product_id: id, storage_path: storagePath, kind, position: count ?? 0 });
  if (error) throw new Error(error.message);
  revalidatePath(page(code));
}

export async function deleteMedia(code: string, mediaId: string) {
  await requireRole("owner", "producto", "marketing");
  const supabase = await createClient();
  const { data } = await supabase.from("product_media").select("storage_path").eq("id", mediaId).single();
  if (data) await supabase.storage.from("product-media").remove([data.storage_path]);
  await supabase.from("product_media").delete().eq("id", mediaId);
  back(code, "ok", "Archivo eliminado", "#media");
}

export async function addOffer(code: string, formData: FormData) {
  await requireRole(...EDITORS);
  let cost: number | null, shipping: number | null;
  try {
    cost = parseEuros(formData.get("unit_cost"));
    shipping = parseEuros(formData.get("shipping"));
  } catch (e) {
    back(code, "error", (e as Error).message, "#proveedores");
  }
  if (cost == null) back(code, "error", "Indica el coste unitario", "#proveedores");
  const { supabase, id } = await productId(code);
  const role = str(formData, "role");
  // Only one main supplier per product: demote the previous one.
  if (role === "principal") {
    await supabase.from("supplier_offers").update({ role: "candidato" }).eq("product_id", id).eq("role", "principal");
  }
  const days = str(formData, "promised_days");
  const { error } = await supabase.from("supplier_offers").upsert(
    {
      product_id: id,
      supplier_id: str(formData, "supplier_id"),
      role,
      unit_cost_cents: cost,
      shipping_cents: shipping ?? 0,
      promised_days: days ? Number(days) : null,
      reviewed_at: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "product_id,supplier_id" },
  );
  if (error) back(code, "error", error.message, "#proveedores");
  back(code, "ok", "Oferta guardada", "#proveedores");
}

export async function addSample(code: string, formData: FormData) {
  const staff = await requireRole(...EDITORS);
  const { supabase, id } = await productId(code);
  const { data: sampleCode } = await supabase.rpc("next_code", { prefix: "MUE" });
  const { error } = await supabase.from("samples").insert({
    code: sampleCode,
    product_id: id,
    supplier_id: str(formData, "supplier_id"),
    ordered_at: str(formData, "ordered_at") || undefined,
    created_by: staff.id,
  });
  if (error) back(code, "error", error.message, "#muestras");
  back(code, "ok", `Muestra ${sampleCode} registrada`, "#muestras");
}

export async function updateSample(code: string, sampleId: string, formData: FormData) {
  await requireRole(...EDITORS);
  const supabase = await createClient();
  const quality = str(formData, "quality");
  const matches = str(formData, "matches_photos");
  const { error } = await supabase
    .from("samples")
    .update({
      status: str(formData, "status"),
      received_at: str(formData, "received_at") || null,
      quality: quality ? Number(quality) : null,
      matches_photos: matches === "" ? null : matches === "si",
      notes: str(formData, "notes"),
    })
    .eq("id", sampleId);
  if (error) back(code, "error", error.message, "#muestras");
  back(code, "ok", "Muestra actualizada", "#muestras");
}
