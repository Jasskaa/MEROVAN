import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { serviceClient } from "@/lib/admin";
import { markPaidFromSession } from "@/lib/payments";
import { stripe } from "@/lib/store";

// Stripe → us. Only a correctly signed event can mark an order as paid.
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

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    try {
      await markPaidFromSession(event.data.object as Stripe.Checkout.Session);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 }); // Stripe retries
    }
  }
  return NextResponse.json({ received: true });
}
