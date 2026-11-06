"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/admin";
import { rateLimit } from "@/lib/rate-limit";
import { sessionId, stripe } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

async function rpcCart(variantId: string, qty: number, add: boolean) {
  const sid = await sessionId();
  if (!sid) throw new Error("Activa las cookies para usar el carrito");
  if (!rateLimit(`cart:${sid}`, 60, 60_000).ok) throw new Error("Demasiadas peticiones, espera un momento");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cart_set", { p_session: sid, p_variant: variantId, p_qty: qty, p_add: add });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function addToCart(formData: FormData) {
  const variant = String(formData.get("variant"));
  const qty = Math.max(1, Math.min(20, Number(formData.get("qty") ?? 1)));
  await rpcCart(variant, qty, true);
  redirect("/carrito");
}

export async function setQuantity(variantId: string, formData: FormData) {
  // "set" comes from the −, + and Quitar buttons; "qty" from the typed amount with "Actualizar".
  const value = formData.get("set") ?? formData.get("qty") ?? 0;
  await rpcCart(variantId, Math.max(0, Math.min(20, Number(value) || 0)), false);
}

type Prepared = { order_id: string; reused: boolean; stripe_session_id: string | null; stripe_session_url: string | null; reserved_until: string; superseded: string[] | null };

/**
 * Prepares the order (stock reserved in the database) and sends the buyer to Stripe Checkout.
 * Retries and double clicks reuse the same order and Stripe session; a changed cart replaces the
 * old order, whose Stripe session is closed. Session creation uses a stable idempotency key, so a
 * failure between Stripe and our database is recovered on the next attempt.
 */
export async function checkout() {
  const sid = await sessionId();
  if (!sid) redirect("/carrito");
  if (!rateLimit(`checkout:${sid}`, 10, 10 * 60_000).ok) redirect("/carrito?error=" + encodeURIComponent("Demasiados intentos de pago, espera unos minutos"));
  const supabase = await createClient();
  const prepare = async () => {
    const { data, error } = await supabase.rpc("checkout_prepare", { p_session: sid });
    if (error) redirect("/carrito?error=" + encodeURIComponent(error.message));
    return (data as Prepared[])[0];
  };
  let p = await prepare();
  const orderId = p.order_id;

  const client = stripe();
  if (!client) redirect(`/pedido/${orderId}`);
  const db = serviceClient();

  for (const old of p.superseded ?? []) {
    await client.checkout.sessions.expire(old).catch(() => undefined); // already paid/expired: the database handles it
  }

  if (p.reused && p.stripe_session_id) {
    const existing = await client.checkout.sessions.retrieve(p.stripe_session_id).catch(() => null);
    if (existing?.status === "open" && existing.url) redirect(existing.url);
    if (existing?.status === "complete") redirect(`/pedido/${orderId}?pagado=1&session_id=${existing.id}`);
    // Expired at Stripe (or unreadable): free that order and start a fresh one.
    if (db) await db.rpc("release_order_by_session", { p_session_id: p.stripe_session_id });
    p = await prepare();
  }

  const { data: lines } = await supabase.rpc("order_lines", { p_order: p.order_id });
  const origin = (await headers()).get("origin") ?? `http://${(await headers()).get("host")}`;
  const session = await client.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"], // card wallets included; no delayed payment methods
    expires_at: Math.floor(new Date(p.reserved_until).getTime() / 1000),
    currency: "eur",
    locale: "es",
    client_reference_id: p.order_id,
    metadata: { order_id: p.order_id },
    line_items: [
      ...(lines ?? []).map((l: { product_name: string; variant_title: string | null; quantity: number; unit_price_cents: number }) => ({
        quantity: l.quantity,
        price_data: {
          currency: "eur",
          unit_amount: l.unit_price_cents,
          product_data: { name: l.variant_title && l.variant_title !== "Única" ? `${l.product_name} · ${l.variant_title}` : l.product_name },
        },
      })),
      ...((lines?.[0]?.shipping_cents ?? 0) > 0
        ? [{ quantity: 1, price_data: { currency: "eur", unit_amount: lines![0].shipping_cents, product_data: { name: "Envío" } } }]
        : []),
    ],
    shipping_address_collection: { allowed_countries: ["ES"] },
    phone_number_collection: { enabled: true },
    success_url: `${origin}/pedido/${p.order_id}?pagado=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/carrito`,
  }, { idempotencyKey: `merovan-checkout-${p.order_id}` });
  if (db) await db.rpc("checkout_attach_session", { p_order: p.order_id, p_session_id: session.id, p_url: session.url });
  redirect(session.url!);
}
