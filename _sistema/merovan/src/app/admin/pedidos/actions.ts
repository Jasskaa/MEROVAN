"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, loadSettings, requireRole } from "@/lib/admin";
import { parseEuros } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const OPS = ["owner", "operaciones"] as const;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

function back(path: string, kind: "ok" | "error", msg: string): never {
  revalidatePath(path);
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}
const money = (f: FormData, k: string, path: string) => {
  try {
    return parseEuros(f.get(k));
  } catch (e) {
    back(path, "error", (e as Error).message);
  }
};

/** TikTok Shop orders are registered by hand until there is an API connection. */
export async function createManualOrder(formData: FormData) {
  await requireRole(...OPS);
  const path = "/admin/pedidos";
  const qty = Math.max(1, Number(str(formData, "quantity") || 1));
  const unit = money(formData, "unit_price", path);
  if (!unit) back(path, "error", "Indica el precio de venta");
  const supabase = await createClient();
  const { data: v } = await supabase.from("product_variants")
    .select("id, product_id, products(vat_rate, supplier_offers(role, unit_cost_cents, shipping_cents))")
    .eq("sku", str(formData, "sku").toUpperCase()).single();
  if (!v) back(path, "error", "No existe ese SKU");

  const settings = await loadSettings();
  const product = v.products as unknown as { vat_rate: number; supplier_offers: { role: string; unit_cost_cents: number; shipping_cents: number }[] };
  const offer = product.supplier_offers?.find((o) => o.role === "principal");
  const total = unit * qty;
  const vat = Math.round((total * Number(product.vat_rate)) / (1 + Number(product.vat_rate)));
  const channel = str(formData, "channel") || "tiktok_shop";
  const commission = channel === "tiktok_shop" ? Number(settings.tiktok_shop_commission ?? 0.09) : 0;

  const { data: order, error } = await supabase.from("orders").insert({
    channel, status: "pagado", external_ref: opt(formData, "external_ref"),
    customer_name: opt(formData, "customer_name"), shipping_country: str(formData, "country") || "ES",
    subtotal_cents: total, total_cents: total, vat_cents: vat,
    platform_fee_cents: Math.round((total - vat) * commission),
    paid_at: new Date(str(formData, "paid_on") || Date.now()).toISOString(),
  }).select("id, number").single();
  if (error) back(path, "error", error.message);
  await supabase.from("order_items").insert({
    order_id: order.id, product_id: v.product_id, variant_id: v.id, quantity: qty, unit_price_cents: unit,
    unit_cost_cents: offer ? offer.unit_cost_cents + offer.shipping_cents : null,
  });
  await audit("pedido_manual", "orders", String(order.number), { channel });
  back(`/admin/pedidos/${order.number}`, "ok", `Pedido nº ${order.number} registrado`);
}

export async function saveSupplierOrder(orderId: string, number: number, formData: FormData) {
  await requireRole(...OPS);
  const path = `/admin/pedidos/${number}`;
  const status = str(formData, "status");
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data: prev } = await supabase.from("supplier_orders").select("status, ordered_at, shipped_at, delivered_at").eq("order_id", orderId).maybeSingle();
  const { error } = await supabase.from("supplier_orders").upsert({
    order_id: orderId,
    supplier_id: opt(formData, "supplier_id"),
    status,
    supplier_ref: opt(formData, "supplier_ref"),
    cost_cents: money(formData, "cost", path),
    carrier: opt(formData, "carrier"),
    tracking_number: opt(formData, "tracking_number"),
    notes: str(formData, "notes"),
    ordered_at: prev?.ordered_at ?? (["pedido", "enviado", "entregado"].includes(status) ? now : null),
    shipped_at: prev?.shipped_at ?? (["enviado", "entregado"].includes(status) ? now : null),
    delivered_at: prev?.delivered_at ?? (status === "entregado" ? now : null),
  }, { onConflict: "order_id" });
  if (error) back(path, "error", error.message);

  // Keep the customer order in step with the supplier order.
  const orderStatus = { pedido: "enviado_proveedor", enviado: "enviado", entregado: "entregado" }[status];
  if (orderStatus) {
    await supabase.from("orders").update({ status: orderStatus, tracking_number: opt(formData, "tracking_number") })
      .eq("id", orderId).in("status", ["pagado", "enviado_proveedor", "enviado"]);
  }
  back(path, "ok", "Pedido al proveedor guardado");
}

export async function createTicket(formData: FormData) {
  const staff = await requireRole(...OPS);
  const number = str(formData, "order_number");
  const supabase = await createClient();
  const { data: order } = number
    ? await supabase.from("orders").select("id, customer_email").eq("number", Number(number)).single()
    : { data: null };
  const { data: t, error } = await supabase.from("tickets").insert({
    order_id: order?.id ?? null, type: str(formData, "type"), subject: str(formData, "subject"),
    customer_email: opt(formData, "customer_email") ?? order?.customer_email ?? null,
    notes: str(formData, "notes"), created_by: staff.id,
  }).select("number").single();
  if (error) back("/admin/soporte", "error", error.message);
  back("/admin/soporte", "ok", `Incidencia #${t.number} abierta`);
}

export async function updateTicket(id: string, formData: FormData) {
  await requireRole(...OPS);
  const status = str(formData, "status");
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("first_response_at").eq("id", id).single();
  const now = new Date().toISOString();
  const { error } = await supabase.from("tickets").update({
    status, notes: str(formData, "notes"),
    first_response_at: t?.first_response_at ?? (formData.get("responded") === "on" || status !== "abierto" ? now : null),
    resolved_at: status === "resuelto" ? now : null,
  }).eq("id", id);
  back("/admin/soporte", error ? "error" : "ok", error?.message ?? "Incidencia actualizada");
}

export async function createReturn(orderId: string, number: number, formData: FormData) {
  await requireRole(...OPS);
  const path = `/admin/pedidos/${number}`;
  const supabase = await createClient();
  const { error } = await supabase.from("returns").insert({
    order_id: orderId, product_id: opt(formData, "product_id"), reason: str(formData, "reason"),
    refund_cents: money(formData, "refund", path) ?? 0, return_cost_cents: money(formData, "return_cost", path) ?? 0,
  });
  back(path, error ? "error" : "ok", error?.message ?? "Devolución registrada");
}

export async function updateReturn(id: string, formData: FormData) {
  await requireRole(...OPS);
  const path = "/admin/soporte";
  const status = str(formData, "status");
  const supabase = await createClient();
  const { data: r, error } = await supabase.from("returns").update({
    status, refund_cents: money(formData, "refund", path) ?? 0, return_cost_cents: money(formData, "return_cost", path) ?? 0,
    refunded_at: status === "reembolsada" ? new Date().toISOString().slice(0, 10) : null,
  }).eq("id", id).select("order_id, refund_cents").single();
  if (error) back(path, "error", error.message);

  // A full refund marks the order as refunded (it stops counting as a sale in the dashboards).
  if (status === "reembolsada") {
    const { data: o } = await supabase.from("orders").select("total_cents").eq("id", r.order_id).single();
    const { data: all } = await supabase.from("returns").select("refund_cents").eq("order_id", r.order_id).eq("status", "reembolsada");
    const refunded = (all ?? []).reduce((s, x) => s + x.refund_cents, 0);
    if (o && refunded >= o.total_cents) await supabase.from("orders").update({ status: "reembolsado" }).eq("id", r.order_id);
  }
  await audit("devolucion", "returns", id, { status });
  back(path, "ok", "Devolución actualizada");
}

export async function createDispute(orderId: string, number: number, formData: FormData) {
  await requireRole("owner", "operaciones", "finanzas");
  const path = `/admin/pedidos/${number}`;
  const supabase = await createClient();
  const { error } = await supabase.from("disputes").insert({
    order_id: orderId, amount_cents: money(formData, "amount", path) ?? 0, fee_cents: money(formData, "fee", path) ?? 0,
    reason: str(formData, "reason"),
  });
  back(path, error ? "error" : "ok", error?.message ?? "Disputa registrada");
}

export async function updateDispute(id: string, formData: FormData) {
  await requireRole("owner", "operaciones", "finanzas");
  const status = str(formData, "status");
  const supabase = await createClient();
  const { error } = await supabase.from("disputes")
    .update({ status, closed_at: status === "abierta" ? null : new Date().toISOString().slice(0, 10) }).eq("id", id);
  back("/admin/soporte", error ? "error" : "ok", error?.message ?? "Disputa actualizada");
}
