import "server-only";
import type Stripe from "stripe";
import { serviceClient } from "@/lib/admin";
import { shippingFromSession } from "@/lib/domain/checkout";
import { stripe } from "@/lib/store";

/** What the database did with a payment. Anything but pagado/ya_pagado is logged in payment_events for review. */
export type PaymentOutcome =
  | "pagado" | "ya_pagado" | "pedido_inexistente" | "importe_no_coincide" | "sesion_no_coincide"
  | "sin_stock" | "pago_duplicado" | "pedido_cancelado" | "no_pagado" | "sin_pedido";

/**
 * Applies a Stripe Checkout Session already verified as genuine (signed webhook or retrieved with our key).
 * The database checks order, session, amount and currency, and is idempotent for repeated webhooks.
 * Throws only on infrastructure errors (so the webhook answers 500 and Stripe retries).
 */
export async function markPaidFromSession(s: Stripe.Checkout.Session): Promise<PaymentOutcome> {
  const db = serviceClient();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const orderId = s.metadata?.order_id ?? s.client_reference_id;
  if (!orderId) return "sin_pedido"; // not a MEROVAN checkout
  if (s.payment_status !== "paid") return "no_pagado";
  const ship = shippingFromSession(s);
  const { data, error } = await db.rpc("confirm_order_payment", {
    p_order: orderId,
    p_session_id: s.id,
    p_payment_ref: s.payment_intent?.toString() ?? s.id,
    p_amount: s.amount_total,
    p_currency: s.currency,
    p_email: s.customer_details?.email ?? null,
    p_name: s.customer_details?.name ?? ship.name,
    p_ship: { ...ship, country: ship.country ?? "ES" },
  });
  if (error) throw new Error(error.message);
  return data as PaymentOutcome;
}

/** Stripe says the session expired without payment: free the stock it was holding. */
export async function releaseExpiredSession(sessionId: string) {
  const db = serviceClient();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const { error } = await db.rpc("release_order_by_session", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
}

/**
 * Fallback to the webhook: when the buyer returns from Checkout we ask Stripe directly (with our
 * secret key) whether that session is paid. The session id in the URL proves nothing by itself.
 */
export async function confirmReturnedSession(sessionId: string, orderId: string) {
  const client = stripe();
  if (!client || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return false;
  try {
    const s = await client.checkout.sessions.retrieve(sessionId);
    if ((s.metadata?.order_id ?? s.client_reference_id) !== orderId) return false;
    const r = await markPaidFromSession(s);
    return r === "pagado" || r === "ya_pagado";
  } catch {
    return false; // the page keeps saying "checking"; the webhook will finish the job
  }
}
