import Link from "next/link";
import { notFound } from "next/navigation";
import { Monogram } from "@/components/store/logo";
import { type OrderStatus, orderView } from "@/lib/domain/checkout";
import { eur } from "@/lib/format";
import { confirmReturnedSession } from "@/lib/payments";
import { stripe } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tu pedido" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagado?: string; session_id?: string }> }) {
  const { id } = await params;
  const { pagado, session_id } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  let { data: lines } = await supabase.rpc("order_lines", { p_order: id });
  if (!lines?.length) notFound();
  if (lines[0].status === "pendiente_pago" && session_id && (await confirmReturnedSession(session_id, id))) {
    ({ data: lines } = await supabase.rpc("order_lines", { p_order: id }));
  }
  const o = lines[0];
  // Only the database status counts; ?pagado=1 just means the buyer came back from Stripe.
  const view = orderView(o.status as OrderStatus, { returningFromPayment: pagado === "1", paymentsEnabled: stripe() !== null });

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center sm:py-24">
      <Monogram size={64} id="mv-order" className="mx-auto" />
      <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-brass">Pedido nº {o.number}</p>
      <h1 className="mt-3 font-display text-5xl uppercase sm:text-6xl">{view.title}</h1>
      <p className="mt-4 leading-relaxed text-stone">{view.message}</p>
      {view.showRetry && (
        <Link href="/carrito" className="mt-6 inline-block rounded-full border border-ink px-7 py-3 text-sm uppercase tracking-[0.18em]">Volver al carrito para pagar</Link>
      )}
      <ul className="mt-10 divide-y divide-line border-y border-line text-left text-sm">
        {lines.map((l: { product_name: string; variant_title: string | null; quantity: number; unit_price_cents: number }, i: number) => (
          <li key={i} className="flex justify-between py-4">
            <span>{l.quantity} × <span className="font-medium">{l.product_name}</span></span>
            <span className="tabular-nums">{eur(l.unit_price_cents * l.quantity)}</span>
          </li>
        ))}
        {o.shipping_cents > 0 && <li className="flex justify-between py-4"><span>Envío</span><span className="tabular-nums">{eur(o.shipping_cents)}</span></li>}
        <li className="flex justify-between py-4 text-base font-medium"><span>Total (IVA incl.)</span><span className="tabular-nums">{eur(o.total_cents)}</span></li>
      </ul>
      <Link href="/#productos" className="mt-10 inline-block rounded-full bg-ink px-7 py-3.5 text-sm uppercase tracking-[0.18em] text-ivory">Seguir comprando</Link>
    </main>
  );
}
