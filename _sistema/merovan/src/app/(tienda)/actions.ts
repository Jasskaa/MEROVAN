"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionId, stripe } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

async function rpcCart(variantId: string, qty: number, add: boolean) {
  const sid = await sessionId();
  if (!sid) throw new Error("Activa las cookies para usar el carrito");
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
  await rpcCart(variantId, Number(formData.get("qty") ?? 0), false);
}

/** Creates the order from the cart (database prices) and sends the buyer to Stripe Checkout. */
export async function checkout() {
  const sid = await sessionId();
  if (!sid) redirect("/carrito");
  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("checkout_create_order", { p_session: sid });
  if (error) redirect("/carrito?error=" + encodeURIComponent(error.message));

  const client = stripe();
  if (!client) redirect(`/pedido/${orderId}`);

  const { data: lines } = await supabase.rpc("order_lines", { p_order: orderId });
  const origin = (await headers()).get("origin") ?? `http://${(await headers()).get("host")}`;
  const session = await client.checkout.sessions.create({
    mode: "payment",
    currency: "eur",
    locale: "es",
    client_reference_id: orderId,
    metadata: { order_id: orderId },
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
    success_url: `${origin}/pedido/${orderId}?pagado=1`,
    cancel_url: `${origin}/carrito`,
  });
  redirect(session.url!);
}
