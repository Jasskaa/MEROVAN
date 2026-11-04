/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */
import Link from "next/link";
import { IconArrow, IconBox, IconChat, IconLock, IconReturn, IconShield, IconStar, IconTruck } from "@/components/store/icons";
import { ImagePlaceholder, ProductCard, discountPct } from "@/components/store/product-card";
import { publishedProducts } from "@/lib/catalog";
import { eur } from "@/lib/format";
import { trackView } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TRUST = [
  { icon: IconTruck, title: "Envío desde la UE", text: "Sin aduanas ni sorpresas." },
  { icon: IconReturn, title: "14 días para devolverlo", text: "Si no te convence, lo devuelves." },
  { icon: IconLock, title: "Pago seguro", text: "Con Stripe; nunca vemos tu tarjeta." },
  { icon: IconChat, title: "Respuesta en 24 h", text: "Personas reales detrás de cada pedido." },
];

const MARQUEE = ["Novedades cada semana", "Envío desde Europa", "Productos probados uno a uno", "Devolución en 14 días", "Pago seguro", "Atención en 24 h"];

const PRINCIPLES = [
  { icon: IconBox, title: "Lo probamos antes", text: "Pedimos muestras y revisamos calidad, embalaje y plazos antes de publicar un producto." },
  { icon: IconShield, title: "Cumplimos la normativa", text: "Fabricante y advertencias de seguridad (GPSR) en cada ficha, como exige la UE." },
  { icon: IconReturn, title: "Sin letra pequeña", text: "Precio final con IVA, plazos realistas y devolución sencilla." },
];

const FAQ = [
  { q: "¿Cuánto tarda el envío?", a: "Enviamos desde almacenes en la Unión Europea. Verás el plazo estimado antes de pagar y te enviaremos el número de seguimiento." },
  { q: "¿Puedo devolver un producto?", a: "Sí. Tienes 14 días desde que lo recibes para desistir de la compra. Escríbenos y te indicamos cómo hacerlo." },
  { q: "¿Es seguro pagar aquí?", a: "El pago se hace en Stripe, una de las pasarelas más usadas del mundo. MEROVAN no ve ni guarda los datos de tu tarjeta." },
  { q: "¿Necesito crear una cuenta?", a: "No. Compras como invitado: solo te pedimos lo necesario para enviarte el pedido." },
];

export default async function StoreHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (supabaseConfigured) await trackView("/", null, await searchParams);
  const products = await publishedProducts();
  const [featured, ...rest] = products;
  const deals = products.filter((p) => discountPct(p.price_cents, p.compare_at_cents));

  return (
    <>
      {/* Hero: product showcase */}
      <section className="relative overflow-hidden bg-ink text-ivory">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_40%,rgba(217,188,134,0.16),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div>
            <p className="animate-rise flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-champagne">
              <IconStar className="text-brass" /> Nueva selección
            </p>
            <h1 className="animate-rise mt-5 font-serif text-5xl leading-[1.02] [animation-delay:100ms] sm:text-7xl">
              Lo útil,<br /><em className="text-champagne">bien hecho.</em>
            </h1>
            <p className="animate-rise mt-6 max-w-md text-base leading-relaxed text-ivory/70 [animation-delay:200ms] sm:text-lg">
              Productos para el día a día que hemos probado uno a uno. Envío desde Europa y devolución sencilla.
            </p>
            <div className="animate-rise mt-9 flex flex-wrap gap-3 [animation-delay:300ms]">
              <Link href={featured ? `/p/${featured.slug}` : "#coleccion"} className="group inline-flex items-center gap-2 bg-champagne px-7 py-4 text-sm font-medium uppercase tracking-[0.18em] text-ink transition hover:bg-[#f0e3cb]">
                Comprar ahora <IconArrow className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link href="#coleccion" className="inline-flex items-center border border-ivory/25 px-7 py-4 text-sm uppercase tracking-[0.18em] text-ivory/90 transition hover:border-champagne hover:text-champagne">
                Ver todo
              </Link>
            </div>
            <dl className="animate-rise mt-12 flex gap-10 border-t border-white/10 pt-6 text-sm [animation-delay:400ms]">
              <div><dt className="text-ivory/50">Productos</dt><dd className="mt-1 font-serif text-3xl text-champagne">{products.length}</dd></div>
              <div><dt className="text-ivory/50">Devolución</dt><dd className="mt-1 font-serif text-3xl text-champagne">14 días</dd></div>
              <div><dt className="text-ivory/50">Envío desde</dt><dd className="mt-1 font-serif text-3xl text-champagne">UE</dd></div>
            </dl>
          </div>

          {featured && (
            <Link href={`/p/${featured.slug}`} className="group animate-rise relative block [animation-delay:200ms]">
              <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-ink-soft sm:aspect-[5/5] lg:aspect-[4/5]">
                {featured.images[0]
                  ? <img src={featured.images[0]} alt={featured.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
                  : <ImagePlaceholder className="h-full w-full" />}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent p-6 pt-24">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-champagne">Destacado</p>
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <p className="font-serif text-3xl leading-tight sm:text-4xl">{featured.name}</p>
                    {featured.price_cents != null && <p className="shrink-0 text-xl tabular-nums">{eur(featured.price_cents)}</p>}
                  </div>
                  <p className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ivory/80 group-hover:text-champagne">
                    Ver producto <IconArrow className="h-4 w-4 transition group-hover:translate-x-1" />
                  </p>
                </div>
              </div>
              {rest[0] && (
                <div className="absolute -bottom-6 -left-6 hidden w-40 border-4 border-ink bg-ink shadow-2xl lg:block">
                  <div className="aspect-square overflow-hidden">
                    {rest[0].images[0] ? <img src={rest[0].images[0]} alt="" className="h-full w-full object-cover" /> : <ImagePlaceholder className="h-full w-full" />}
                  </div>
                  <p className="truncate px-2 py-2 text-xs">{rest[0].name}</p>
                </div>
              )}
            </Link>
          )}
        </div>
      </section>

      {/* Marquee */}
      <div className="overflow-hidden border-y border-line bg-champagne/40 py-3" aria-hidden>
        <div className="animate-marquee flex w-max gap-10 whitespace-nowrap text-[12px] uppercase tracking-[0.3em] text-ink/70">
          {[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i} className="flex items-center gap-10">{m}<IconStar className="text-brass" /></span>)}
        </div>
      </div>

      {/* Collection */}
      <section id="coleccion" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-brass">Catálogo</p>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl">Todos los productos</h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-stone">Cada producto ha pasado nuestra revisión de calidad, proveedor y seguridad antes de llegar aquí.</p>
        </div>
        {products.length === 0 ? (
          <p className="border border-line py-20 text-center text-stone">Estamos preparando el catálogo. Vuelve pronto.</p>
        ) : (
          <div className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p, i) => <ProductCard key={p.code} p={p} priority={i < 4} />)}
          </div>
        )}
      </section>

      {deals.length > 0 && (
        <section id="ofertas" className="scroll-mt-24 bg-ink py-20 text-ivory">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <p className="text-[11px] uppercase tracking-[0.28em] text-champagne">Por tiempo limitado</p>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl">Ofertas</h2>
            <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4 [&_h3]:text-ivory [&_p]:text-ivory">
              {deals.map((p) => <ProductCard key={p.code} p={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* Trust */}
      <section className="border-y border-line bg-ivory">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3 bg-ivory px-5 py-8 sm:px-8">
              <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brass" />
              <div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-stone">{text}</p></div>
            </li>
          ))}
        </ul>
      </section>

      {/* Philosophy */}
      <section id="filosofia" className="scroll-mt-24 bg-sand">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-brass">Cómo trabajamos</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">Menos catálogo, <em className="text-brass">más criterio</em></h2>
            <p className="mt-6 max-w-md leading-relaxed text-stone">Elegimos pocos productos, los comprobamos y solo los publicamos cuando estamos seguros de que merecen la pena.</p>
          </div>
          <ol className="grid gap-px bg-line sm:grid-cols-3 lg:grid-cols-1">
            {PRINCIPLES.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-5 bg-sand p-6 sm:p-8">
                <span className="font-serif text-3xl text-brass/70">0{i + 1}</span>
                <div>
                  <p className="flex items-center gap-2 font-medium"><Icon className="h-5 w-5 text-brass" />{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section id="ayuda" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 sm:py-24">
        <p className="text-center text-[11px] uppercase tracking-[0.28em] text-brass">Ayuda</p>
        <h2 className="mt-3 text-center font-serif text-4xl sm:text-5xl">Preguntas frecuentes</h2>
        <div className="mt-12 divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium">
                {f.q}<span className="text-xl text-brass transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-stone">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
