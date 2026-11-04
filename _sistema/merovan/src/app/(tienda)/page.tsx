/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */
import Link from "next/link";
import { IconChat, IconLock, IconReturn, IconTruck } from "@/components/store/icons";
import { IconArrowUpRight } from "@/components/store/icons-extra";
import { ImagePlaceholder, ProductCard, discountPct } from "@/components/store/product-card";
import { publishedProducts } from "@/lib/catalog";
import { eur } from "@/lib/format";
import { trackView } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PERKS = [
  { icon: IconTruck, title: "Envío desde la UE", text: "Sin aduanas ni sorpresas" },
  { icon: IconReturn, title: "14 días", text: "Para devolverlo si no te convence" },
  { icon: IconLock, title: "Pago seguro", text: "Con Stripe, nunca vemos tu tarjeta" },
  { icon: IconChat, title: "Respuesta en 24 h", text: "Personas reales, no bots" },
];

const FAQ = [
  { q: "¿Cuánto tarda el envío?", a: "Enviamos desde almacenes en la Unión Europea. Verás el plazo estimado antes de pagar y te enviaremos el número de seguimiento." },
  { q: "¿Puedo devolver un producto?", a: "Sí. Tienes 14 días desde que lo recibes para desistir de la compra. Escríbenos y te indicamos cómo hacerlo." },
  { q: "¿Es seguro pagar aquí?", a: "El pago se hace en Stripe, una de las pasarelas más usadas del mundo. MEROVAN no ve ni guarda los datos de tu tarjeta." },
  { q: "¿Necesito crear una cuenta?", a: "No. Compras como invitado: solo te pedimos lo necesario para enviarte el pedido." },
];

function PillButton({ href, children, dark = false }: { href: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-sm font-medium transition ${dark ? "bg-ink text-ivory hover:bg-ink-soft" : "bg-ivory text-ink hover:bg-white"}`}>
      {children}
      <span className={`flex h-8 w-8 items-center justify-center rounded-full transition group-hover:rotate-45 ${dark ? "bg-ivory text-ink" : "bg-ink text-ivory"}`}>
        <IconArrowUpRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

export default async function StoreHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (supabaseConfigured) await trackView("/", null, params);
  const q = params.q?.trim();
  const all = await publishedProducts();
  const results = q ? await publishedProducts(q) : all;
  const [featured, ...others] = all;
  const latest = all.slice(0, 4);
  const deals = all.filter((p) => discountPct(p.price_cents, p.compare_at_cents));

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6">
      {/* Hero: giant brand word behind the featured product */}
      <section className="relative mt-3 overflow-hidden rounded-[28px] bg-ink text-ivory sm:mt-5">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_70%,rgba(229,213,188,0.14),transparent_60%)]" />
        <p aria-hidden className="relative select-none pt-6 text-center font-display text-[24vw] leading-[0.82] tracking-tight text-ivory sm:pt-8 lg:text-[15.5rem]">
          MEROVAN
        </p>

        {featured && (
          <Link href={`/p/${featured.slug}`} className="group relative mx-auto -mt-[5vw] block w-[58%] max-w-md sm:-mt-[10vw] sm:w-[46%] lg:-mt-36">
            <div className="aspect-square overflow-hidden rounded-3xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)]">
              {featured.images[0]
                ? <img src={featured.images[0]} alt={featured.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                : <ImagePlaceholder dark className="h-full w-full !bg-ink-soft" />}
            </div>
          </Link>
        )}

        <div className="relative grid gap-8 px-5 pb-8 pt-8 sm:px-10 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
          <div className="max-w-sm">
            <p className="text-sm leading-relaxed text-ivory/70">
              Productos para el día a día, probados uno a uno y enviados desde Europa. Sin ruido, sin sorpresas.
            </p>
            <div className="mt-5"><PillButton href={featured ? `/p/${featured.slug}` : "#productos"}>Comprar ahora</PillButton></div>
          </div>
          {featured && (
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-champagne">Destacado</p>
              <p className="mt-1 text-lg font-medium">{featured.name}</p>
              {featured.price_cents != null && <p className="text-sm tabular-nums text-ivory/70">{eur(featured.price_cents)}</p>}
            </div>
          )}
          {others.length > 0 && (
            <div className="flex gap-3 lg:justify-end">
              {others.slice(0, 3).map((p) => (
                <Link key={p.code} href={`/p/${p.slug}`} title={p.name} className="h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-champagne sm:h-24 sm:w-24">
                  {p.images[0] ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" /> : <ImagePlaceholder dark compact className="h-full w-full" />}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Intro + real facts */}
      <section className="grid gap-10 px-2 py-16 sm:py-20 lg:grid-cols-2 lg:items-end">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Descubre lo útil,<br /><span className="text-stone">sin complicaciones.</span>
        </h1>
        <div>
          <p className="max-w-md text-stone">Elegimos pocos productos y los probamos antes de venderlos. Si algo no te convence, tienes 14 días para devolverlo.</p>
          <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-4">
            <div><dd className="text-4xl font-semibold tabular-nums">{all.length}</dd><dt className="text-xs text-stone">productos seleccionados</dt></div>
            <div><dd className="text-4xl font-semibold">14</dd><dt className="text-xs text-stone">días de devolución</dt></div>
            <div><dd className="text-4xl font-semibold">UE</dd><dt className="text-xs text-stone">envío desde Europa</dt></div>
          </dl>
        </div>
      </section>

      {/* Latest */}
      {!q && latest.length > 0 && (
        <section id="novedades" className="scroll-mt-24 pb-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4 px-1">
            <h2 className="font-display text-5xl uppercase leading-none sm:text-7xl">Novedades</h2>
            <PillButton href="#productos" dark>Ver todo</PillButton>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
            {latest.map((p, i) => <ProductCard key={p.code} p={p} priority={i < 4} />)}
          </div>
        </section>
      )}

      {/* Split promo */}
      {featured && !q && (
        <section className="grid overflow-hidden rounded-[28px] bg-ink text-ivory lg:grid-cols-2">
          <div className="flex flex-col justify-between gap-10 p-8 sm:p-12">
            <div>
              <h2 className="font-display text-5xl uppercase leading-[0.95] sm:text-6xl">Todo lo que necesitas,<br /><span className="text-champagne">nada que sobre</span></h2>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-ivory/70">Cada producto pasa nuestra revisión de calidad, proveedor y seguridad antes de llegar a la tienda.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {all.slice(0, 2).map((p) => (
                <Link key={p.code} href={`/p/${p.slug}`} className="h-24 w-24 overflow-hidden rounded-2xl bg-white/5">
                  {p.images[0] ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" /> : <ImagePlaceholder dark compact className="h-full w-full" />}
                </Link>
              ))}
              <div className="ml-auto"><PillButton href={`/p/${featured.slug}`}>Descubrir</PillButton></div>
            </div>
          </div>
          <div className="relative min-h-80 bg-ink-soft">
            {(featured.images[1] ?? featured.images[0])
              ? <img src={featured.images[1] ?? featured.images[0]} alt={featured.name} className="absolute inset-0 h-full w-full object-cover" />
              : <ImagePlaceholder dark className="absolute inset-0" />}
          </div>
        </section>
      )}

      {/* All products / search results */}
      <section id="productos" className="scroll-mt-24 py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 px-1">
          <h2 className="font-display text-5xl uppercase leading-none sm:text-7xl">{q ? `«${q}»` : "Todos los productos"}</h2>
          <form action="/#productos" className="flex items-center gap-2 rounded-full bg-sand px-4 py-2">
            <input name="q" defaultValue={q} placeholder="Buscar productos" aria-label="Buscar productos" className="w-44 bg-transparent text-sm outline-none placeholder:text-stone" />
            {q && <Link href="/#productos" className="text-xs text-stone hover:text-ink">Limpiar</Link>}
          </form>
        </div>
        {results.length === 0 ? (
          <p className="rounded-2xl bg-sand py-20 text-center text-stone">{q ? "No hay productos que coincidan." : "Estamos preparando el catálogo. Vuelve pronto."}</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
            {results.map((p) => <ProductCard key={p.code} p={p} />)}
          </div>
        )}
      </section>

      {deals.length > 0 && !q && (
        <section id="ofertas" className="scroll-mt-24 pb-20">
          <h2 className="mb-8 px-1 font-display text-5xl uppercase leading-none sm:text-7xl">Ofertas</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">{deals.map((p) => <ProductCard key={p.code} p={p} />)}</div>
        </section>
      )}

      {/* Perks */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PERKS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-2xl bg-sand p-5">
            <Icon className="h-6 w-6" />
            <p className="mt-6 font-semibold">{title}</p>
            <p className="text-sm text-stone">{text}</p>
          </li>
        ))}
      </ul>

      {/* About */}
      <section id="nosotros" className="scroll-mt-24 py-20 sm:py-28">
        <p aria-hidden className="select-none text-center font-display text-[18vw] uppercase leading-none tracking-tight text-ink/[0.05] lg:text-[11rem]">Bienvenido</p>
        <div className="mt-8 grid gap-6 border-t border-line pt-8 text-sm sm:grid-cols-[120px_200px_1fr]">
          <span className="text-stone">001</span>
          <span className="font-medium">Sobre MEROVAN</span>
          <div className="max-w-xl space-y-4 leading-relaxed text-ink/80">
            <p>MEROVAN es una tienda online con una idea sencilla: pocos productos, bien elegidos. Antes de publicar cualquier artículo pedimos muestras y comprobamos su calidad, el embalaje y los plazos de entrega.</p>
            <p>Trabajamos con almacenes en la Unión Europea para que tu pedido llegue sin aduanas, con seguimiento y con la garantía de devolución de 14 días.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="ayuda" className="scroll-mt-24 pb-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="font-display text-5xl uppercase leading-none sm:text-7xl">Preguntas<br />frecuentes</h2>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl bg-sand px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-ivory transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-stone">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
