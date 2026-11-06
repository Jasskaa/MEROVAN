import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { serviceClient } from "@/lib/admin";
import { markPaidFromSession, releaseExpiredSession } from "@/lib/payments";
import { stripe } from "@/lib/store";

// Stripe → us. Only a correctly signed event can mark an order as paid.
// Payments that cannot be applied (unknown order, wrong amount, no stock…) are recorded in
// payment_events by the database and answered 200: retrying would not change the result.
export async function POST(request: Request) {
  const client = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!client || !secret || !serviceClient()) return NextResponse.json({ error: "Pagos no configurados" }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const outcome = await markPaidFromSession(event.data.object as Stripe.Checkout.Session);
      return NextResponse.json({ received: true, outcome });
    }
    if (event.type === "checkout.session.expired") {
      await releaseExpiredSession((event.data.object as Stripe.Checkout.Session).id);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 }); // Stripe retries
  }
  return NextResponse.json({ received: true });
}
