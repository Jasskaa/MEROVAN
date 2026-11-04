import Link from "next/link";
import { notFound } from "next/navigation";
import { eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tu pedido" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagado?: string }> }) {
  const { id } = await params;
  const { pagado } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: lines } = await supabase.rpc("order_lines", { p_order: id });
  if (!lines?.length) notFound();
  const o = lines[0];
  const paid = o.status !== "pendiente_pago";

  return (
    <main className="mx-auto max-w-xl px-4 py-12 text-center">
      <h1 className="font-serif text-3xl">{paid || pagado ? "¡Gracias por tu compra!" : "Pedido pendiente de pago"}</h1>
      <p className="mt-2 text-muted">Pedido nº {o.number}</p>
      {pagado && !paid && <p className="mt-2 text-sm text-muted">Estamos confirmando el pago; recarga en unos segundos.</p>}
      {!paid && !pagado && <p className="mt-2 text-sm text-muted">Los pagos online aún no están activados en esta tienda.</p>}
      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface text-left text-sm">
        {lines.map((l: { product_name: string; variant_title: string | null; quantity: number; unit_price_cents: number }, i: number) => (
          <li key={i} className="flex justify-between p-3">
            <span>{l.quantity} × {l.product_name}</span>
            <span className="tabular-nums">{eur(l.unit_price_cents * l.quantity)}</span>
          </li>
        ))}
        {o.shipping_cents > 0 && <li className="flex justify-between p-3"><span>Envío</span><span className="tabular-nums">{eur(o.shipping_cents)}</span></li>}
        <li className="flex justify-between p-3 font-semibold"><span>Total</span><span className="tabular-nums">{eur(o.total_cents)}</span></li>
      </ul>
      <Link href="/" className="mt-6 inline-block text-gold underline">Seguir comprando</Link>
    </main>
  );
}
