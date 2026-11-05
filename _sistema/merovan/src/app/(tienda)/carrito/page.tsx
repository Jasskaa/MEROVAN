/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */
import Link from "next/link";
import { IconArrow, IconLock, IconReturn, IconTruck } from "@/components/store/icons";
import { ImagePlaceholder } from "@/components/store/product-card";
import { SHELL } from "@/components/store/shell";
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
    <main className={`${SHELL} py-10 pb-32 sm:py-16 lg:pb-16`}>
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
        <div className="mt-8 grid gap-8 sm:mt-10 lg:grid-cols-[1fr_400px] lg:gap-12">
          <ul className="divide-y divide-line border-y border-line">
            {lines.map((l) => {
              const max = Math.min(20, l.stock);
              const step = "flex h-10 w-10 items-center justify-center text-lg transition hover:bg-sand disabled:opacity-30";
              return (
                <li key={l.variant_id} className="flex gap-4 py-5 sm:gap-6 sm:py-6">
                  <Link href={`/p/${l.slug}`} className="relative aspect-square w-20 shrink-0 self-start overflow-hidden rounded-2xl bg-sand sm:w-28">
                    {l.image_path ? <img src={mediaUrl(l.image_path)} alt="" className="h-full w-full object-cover" /> : <ImagePlaceholder className="h-full w-full" />}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/p/${l.slug}`} className="line-clamp-2 font-medium hover:text-brass">{l.product_name}</Link>
                        {l.variant_title !== "Única" && <p className="mt-0.5 text-sm text-stone">{l.variant_title}</p>}
                        <p className="mt-1 text-sm tabular-nums text-stone">{eur(l.unit_price_cents)} / ud.</p>
                      </div>
                      <p className="shrink-0 font-medium tabular-nums">{eur(l.unit_price_cents * l.quantity)}</p>
                    </div>
                    <form action={setQuantity.bind(null, l.variant_id)} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      {/* First in the markup so Enter in the box applies the typed amount; shown after the stepper */}
                      <button className="order-2 text-[11px] uppercase tracking-[0.12em] text-stone underline-offset-4 hover:text-ink hover:underline">Actualizar</button>
                      <div className="order-1 flex items-center overflow-hidden rounded-full border border-line">
                        <button name="set" value={l.quantity - 1} formNoValidate aria-label={`Quitar una unidad de ${l.product_name}`} className={step}>−</button>
                        <input name="qty" type="number" min={0} max={max} defaultValue={l.quantity} aria-label={`Cantidad de ${l.product_name}`}
                          className="h-10 w-12 bg-transparent text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                        <button name="set" value={Math.min(max, l.quantity + 1)} formNoValidate disabled={l.quantity >= max} aria-label={`Añadir una unidad de ${l.product_name}`} className={step}>+</button>
                      </div>
                      <button name="set" value={0} formNoValidate className="order-3 ml-auto text-[11px] text-stone underline-offset-4 hover:text-ink hover:underline">Quitar</button>
                    </form>
                  </div>
                </li>
              );
            })}
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

          {/* Phones: total and pay button always within reach */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-4 py-3 backdrop-blur-md lg:hidden">
            <form action={checkout} className="mx-auto flex max-w-xl items-center gap-4">
              <div className="leading-tight">
                <p className="text-xs text-stone">Total ({units})</p>
                <p className="text-lg font-semibold tabular-nums">{eur(total)}</p>
              </div>
              <button className="ml-auto flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium uppercase tracking-[0.15em] text-ivory">
                <IconLock className="h-4 w-4" /> Pagar
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
