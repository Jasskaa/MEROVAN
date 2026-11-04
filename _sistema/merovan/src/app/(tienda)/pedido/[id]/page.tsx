import Link from "next/link";
import { notFound } from "next/navigation";
import { Monogram } from "@/components/store/logo";
import { eur } from "@/lib/format";
import { confirmReturnedSession } from "@/lib/payments";
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
  const paid = o.status !== "pendiente_pago";

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center sm:py-24">
      <Monogram size={64} id="mv-order" className="mx-auto" />
      <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-brass">Pedido nº {o.number}</p>
      <h1 className="mt-3 font-serif text-4xl sm:text-5xl">{paid || pagado ? "Gracias por tu compra" : "Pedido pendiente de pago"}</h1>
      {paid && <p className="mt-4 leading-relaxed text-stone">Te hemos enviado la confirmación por correo. Te avisaremos con el número de seguimiento en cuanto salga del almacén.</p>}
      {pagado && !paid && <p className="mt-4 text-sm text-stone">Estamos confirmando el pago; recarga en unos segundos.</p>}
      {!paid && !pagado && <p className="mt-4 text-sm text-stone">Los pagos online aún no están activados en esta tienda.</p>}
      <ul className="mt-10 divide-y divide-line border-y border-line text-left text-sm">
        {lines.map((l: { product_name: string; variant_title: string | null; quantity: number; unit_price_cents: number }, i: number) => (
          <li key={i} className="flex justify-between py-4">
            <span>{l.quantity} × <span className="font-serif text-lg">{l.product_name}</span></span>
            <span className="tabular-nums">{eur(l.unit_price_cents * l.quantity)}</span>
          </li>
        ))}
        {o.shipping_cents > 0 && <li className="flex justify-between py-4"><span>Envío</span><span className="tabular-nums">{eur(o.shipping_cents)}</span></li>}
        <li className="flex justify-between py-4 text-base font-medium"><span>Total (IVA incl.)</span><span className="tabular-nums">{eur(o.total_cents)}</span></li>
      </ul>
      <Link href="/#coleccion" className="mt-10 inline-block bg-ink px-7 py-3.5 text-sm uppercase tracking-[0.18em] text-ivory">Seguir comprando</Link>
    </main>
  );
}
