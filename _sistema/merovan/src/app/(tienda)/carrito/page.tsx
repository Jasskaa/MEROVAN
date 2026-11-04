/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */
import Link from "next/link";
import { btn, btnGhost } from "@/components/ui";
import { eur } from "@/lib/format";
import { cartLines, mediaUrl, stripe } from "@/lib/store";
import { checkout, setQuantity } from "../actions";

export const metadata = { title: "Carrito" };
export const dynamic = "force-dynamic";

export default async function CartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const lines = await cartLines();
  const total = lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 font-serif text-3xl">Carrito</h1>
      {error && <p role="alert" className="mb-4 rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</p>}
      {lines.length === 0 ? (
        <p className="text-muted">Tu carrito está vacío. <Link href="/" className="text-gold underline">Ver productos</Link></p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {lines.map((l) => (
              <li key={l.variant_id} className="flex items-center gap-4 p-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gold-soft/30">
                  {l.image_path && <img src={mediaUrl(l.image_path)} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1">
                  <Link href={`/p/${l.slug}`} className="font-medium hover:text-gold">{l.product_name}</Link>
                  {l.variant_title !== "Única" && <p className="text-xs text-muted">{l.variant_title}</p>}
                  <p className="text-sm tabular-nums">{eur(l.unit_price_cents)}</p>
                </div>
                <form action={setQuantity.bind(null, l.variant_id)} className="flex items-center gap-1">
                  <input name="qty" type="number" min={0} max={Math.min(20, l.stock)} defaultValue={l.quantity}
                    aria-label={`Cantidad de ${l.product_name}`} className="w-16 rounded-md border border-border bg-surface px-2 py-1" />
                  <button className={btnGhost}>Actualizar</button>
                </form>
                <p className="w-20 text-right font-semibold tabular-nums">{eur(l.unit_price_cents * l.quantity)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="text-lg">Total <strong className="tabular-nums">{eur(total)}</strong> <span className="text-xs text-muted">IVA incl. · envío en el pago</span></p>
            <form action={checkout}><button className={`${btn} px-8 py-3`}>Pagar</button></form>
          </div>
          {!stripe() && <p className="mt-3 text-xs text-muted">Pagos aún no configurados: el pedido se creará como pendiente de pago.</p>}
        </>
      )}
    </main>
  );
}
