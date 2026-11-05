import Link from "next/link";
import { SHELL } from "@/components/store/shell";
import { notFound } from "next/navigation";
import { BuyBox } from "@/components/store/buy-box";
import { Gallery } from "@/components/store/gallery";
import { IconCheck, IconChat, IconLock, IconReturn, IconTruck } from "@/components/store/icons";
import { ProductCard, discountPct } from "@/components/store/product-card";
import { publishedProducts, sortedMedia } from "@/lib/catalog";
import { eur } from "@/lib/format";
import { mediaUrl, trackView } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { addToCart } from "../../actions";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*, product_variants(id, title, price_cents, stock), product_media(storage_path, kind, alt, position)")
    .eq("slug", slug)
    .eq("publish_status", "publicado")
    .single();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  return p ? { title: p.name, description: p.description.slice(0, 155) } : {};
}

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium uppercase tracking-[0.18em]">
        {title}<span className="text-lg text-brass transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-4 text-sm leading-relaxed text-stone">{children}</div>
    </details>
  );
}

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  await trackView(`/p/${slug}`, slug, await searchParams);

  const media = sortedMedia(p.product_media).map((m) => ({
    url: mediaUrl(m.storage_path), kind: m.kind as "image" | "video", alt: (m as { alt?: string }).alt ?? "",
  }));
  const off = discountPct(p.price_cents, p.compare_at_cents);
  const related = (await publishedProducts()).filter((x) => x.slug !== slug).slice(0, 3);
  const specs = [
    ["Referencia", p.code],
    p.weight_g ? ["Peso", `${p.weight_g} g`] : null,
    p.origin_country ? ["País de origen", p.origin_country] : null,
    ["Envío", "Desde almacén en la Unión Europea"],
  ].filter(Boolean) as [string, string][];

  return (
    <main className="pb-24 sm:pb-0">
      <nav aria-label="Ruta" className={`${SHELL} pt-6 text-xs text-stone`}>
        <Link href="/" className="hover:text-ink">Inicio</Link> <span className="mx-1.5">/</span>
        <Link href="/#productos" className="hover:text-ink">Colección</Link> <span className="mx-1.5">/</span>
        <span className="text-ink">{p.name}</span>
      </nav>

      <div className={`${SHELL} grid gap-8 py-6 sm:gap-10 sm:py-8 lg:grid-cols-[1.25fr_1fr] lg:gap-16 lg:py-12`}>
        <Gallery items={media} name={p.name} />

        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-[11px] uppercase tracking-[0.28em] text-brass">MEROVAN · {p.code}</p>
          <h1 className="mt-3 font-display text-4xl uppercase leading-none sm:text-6xl">{p.name}</h1>
          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-2xl tabular-nums">{eur(p.price_cents)}</span>
            {off && (
              <>
                <span className="text-stone line-through tabular-nums">{eur(p.compare_at_cents)}</span>
                <span className="bg-ink px-2 py-0.5 text-xs tracking-wider text-champagne">−{off} %</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-stone">IVA incluido. Gastos de envío calculados al pagar.</p>

          {p.description && <p className="mt-6 leading-relaxed text-ink/80">{p.description.split("\n")[0]}</p>}
          {p.bullets?.length > 0 && (
            <ul className="mt-6 space-y-2.5">
              {p.bullets.map((b: string) => (
                <li key={b} className="flex items-start gap-2.5 text-sm"><IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-brass" />{b}</li>
              ))}
            </ul>
          )}

          <BuyBox variants={p.product_variants ?? []} basePrice={p.price_cents} action={addToCart} name={p.name} />

          <ul className="mt-8 grid grid-cols-3 gap-px border border-line bg-line text-center text-[11px] leading-snug">
            {[{ i: IconTruck, t: "Envío desde la UE" }, { i: IconReturn, t: "14 días de devolución" }, { i: IconLock, t: "Pago seguro" }].map(({ i: I, t }) => (
              <li key={t} className="flex flex-col items-center gap-2 bg-ivory px-2 py-4"><I className="h-5 w-5 text-brass" />{t}</li>
            ))}
          </ul>

          <div className="mt-8 border-t border-line">
            <Section title="Descripción" open>
              <p className="whitespace-pre-line">{p.description}</p>
            </Section>
            <Section title="Características">
              <dl className="divide-y divide-line">
                {specs.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2"><dt>{k}</dt><dd className="text-right text-ink">{v}</dd></div>
                ))}
              </dl>
            </Section>
            <Section title="Envío y devoluciones">
              <p>Preparamos tu pedido y lo enviamos desde un almacén en la Unión Europea, sin aduanas. Recibirás el número de seguimiento por correo.</p>
              <p className="mt-3">Tienes <strong className="text-ink">14 días</strong> desde la entrega para devolverlo. Te reembolsamos en el mismo método de pago.</p>
            </Section>
            <Section title="Seguridad del producto">
              <dl className="space-y-1">
                <div><dt className="inline text-ink">Fabricante / responsable en la UE: </dt><dd className="inline">{p.gpsr_manufacturer}</dd></div>
                <div><dt className="inline text-ink">Dirección: </dt><dd className="inline">{p.gpsr_address}</dd></div>
                <div><dt className="inline text-ink">Contacto: </dt><dd className="inline">{p.gpsr_contact}</dd></div>
                {p.gpsr_warnings && <div><dt className="inline text-ink">Advertencias: </dt><dd className="inline">{p.gpsr_warnings}</dd></div>}
              </dl>
            </Section>
          </div>

          <p className="mt-6 flex items-center gap-2 text-sm text-stone">
            <IconChat className="h-4 w-4 text-brass" /> ¿Dudas? Te respondemos en menos de 24 h.
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className={`${SHELL} border-t border-line py-16 sm:py-20`}>
          <h2 className="mb-10 font-display text-4xl uppercase sm:text-5xl">También te puede gustar</h2>
          <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => <ProductCard key={r.code} p={r} />)}
          </div>
        </section>
      )}
    </main>
  );
}
