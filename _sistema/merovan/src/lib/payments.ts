import "server-only";
import type Stripe from "stripe";
import { serviceClient } from "@/lib/admin";
import { stripe } from "@/lib/store";

/** Marks the order paid from a Stripe Checkout Session already verified as genuine. Idempotent. */
export async function markPaidFromSession(s: Stripe.Checkout.Session) {
  const db = serviceClient();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  if (s.payment_status !== "paid" || !s.metadata?.order_id) return false;
  const { error } = await db.rpc("mark_order_paid", {
    p_order: s.metadata.order_id,
    p_payment_ref: s.payment_intent?.toString() ?? s.id,
    p_email: s.customer_details?.email ?? null,
    p_name: s.customer_details?.name ?? null,
    p_country: s.customer_details?.address?.country ?? "ES",
  });
  if (error) throw new Error(error.message);
  return true;
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
    if (s.metadata?.order_id !== orderId) return false;
    return await markPaidFromSession(s);
  } catch {
    return false; // the page then shows "confirming payment"; the webhook will finish the job
  }
}
