import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { serviceClient } from "@/lib/admin";
import { stripe } from "@/lib/store";

// Stripe → us. Only a correctly signed event can mark an order as paid.
export async function POST(request: Request) {
  const client = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const db = serviceClient();
  if (!client || !secret || !db) return NextResponse.json({ error: "Pagos no configurados" }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status === "paid" && s.metadata?.order_id) {
      const { error } = await db.rpc("mark_order_paid", {
        p_order: s.metadata.order_id,
        p_payment_ref: s.payment_intent?.toString() ?? s.id,
        p_email: s.customer_details?.email ?? null,
        p_name: s.customer_details?.name ?? null,
        p_country: s.customer_details?.address?.country ?? "ES",
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 }); // Stripe retries
    }
  }
  return NextResponse.json({ received: true });
}
