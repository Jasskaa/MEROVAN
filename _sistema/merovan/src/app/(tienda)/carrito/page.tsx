/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */
import Link from "next/link";
import { IconArrow, IconLock, IconReturn, IconTruck } from "@/components/store/icons";
import { ImagePlaceholder } from "@/components/store/product-card";
import { eur } from "@/lib/format";
import { cartLines, mediaUrl, stripe } from "@/lib/store";
import { checkout, setQuantity } from "../actions";

export const metadata = { title: "Carrito" };
export const dynamic = "force-dynamic";

export default async function CartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const lines = await cartLines();
  const total = lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0);
  const units = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-5xl uppercase sm:text-7xl">Tu carrito</h1>
      {error && <p role="alert" className="mt-6 border border-red-700/40 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {lines.length === 0 ? (
        <div className="mt-12 border border-line px-6 py-20 text-center">
          <p className="text-2xl font-semibold">Tu carrito está vacío</p>
          <p className="mt-2 text-sm text-stone">Descubre los productos que hemos seleccionado.</p>
          <Link href="/#productos" className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm uppercase tracking-[0.18em] text-ivory">
            Ver colección <IconArrow className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
          <ul className="divide-y divide-line border-y border-line">
            {lines.map((l) => (
              <li key={l.variant_id} className="flex gap-5 py-6">
                <Link href={`/p/${l.slug}`} className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-sm bg-sand sm:w-28">
                  {l.image_path ? <img src={mediaUrl(l.image_path)} alt="" className="h-full w-full object-cover" /> : <ImagePlaceholder className="h-full w-full" />}
                </Link>
                <div className="flex flex-1 flex-col justify-between gap-3 sm:flex-row">
                  <div>
                    <Link href={`/p/${l.slug}`} className="font-medium hover:text-brass">{l.product_name}</Link>
                    {l.variant_title !== "Única" && <p className="mt-0.5 text-sm text-stone">{l.variant_title}</p>}
                    <p className="mt-1 text-sm tabular-nums text-stone">{eur(l.unit_price_cents)} / ud.</p>
                  </div>
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end">
                    <form action={setQuantity.bind(null, l.variant_id)} className="flex items-center gap-2">
                      <input name="qty" type="number" min={0} max={Math.min(20, l.stock)} defaultValue={l.quantity}
                        aria-label={`Cantidad de ${l.product_name}`} className="h-10 w-16 border border-line bg-transparent px-2 text-center" />
                      <button className="h-10 border border-line px-3 text-xs uppercase tracking-[0.15em] hover:border-ink">Actualizar</button>
                    </form>
                    <p className="font-medium tabular-nums">{eur(l.unit_price_cents * l.quantity)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="h-fit rounded-3xl bg-sand p-6 lg:sticky lg:top-24">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-stone">Resumen</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between"><dt>Productos ({units})</dt><dd className="tabular-nums">{eur(total)}</dd></div>
              <div className="flex justify-between text-stone"><dt>Envío</dt><dd>Se calcula al pagar</dd></div>
              <div className="flex justify-between border-t border-line pt-3 text-lg"><dt className="font-semibold">Total {eur(total)}</dt><dd className="text-xs text-stone">IVA incluido</dd></div>
            </dl>
            <form action={checkout} className="mt-6">
              <button className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium uppercase tracking-[0.2em] text-ivory transition hover:bg-ink-soft">
                <IconLock className="h-4 w-4" /> Pagar de forma segura
              </button>
            </form>
            {!stripe() && <p className="mt-3 text-xs text-stone">Los pagos online aún no están activados: el pedido quedará pendiente de pago.</p>}
            <ul className="mt-6 space-y-2 text-xs text-stone">
              <li className="flex items-center gap-2"><IconTruck className="h-4 w-4 text-brass" /> Envío desde almacén en la UE</li>
              <li className="flex items-center gap-2"><IconReturn className="h-4 w-4 text-brass" /> 14 días para devolverlo</li>
              <li className="flex items-center gap-2"><IconLock className="h-4 w-4 text-brass" /> Pago con Stripe: no vemos tu tarjeta</li>
            </ul>
          </aside>
        </div>
      )}
    </main>
  );
}
