/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */
import { notFound } from "next/navigation";
import { btn } from "@/components/ui";
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

export default async function ProductPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  await trackView(`/p/${slug}`, slug, await searchParams);

  const media = [...(p.product_media ?? [])].sort((a, b) => a.position - b.position);
  const variants = (p.product_variants ?? []).filter((v: { stock: number }) => v.stock > 0);

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2">
      <div className="space-y-3">
        {media.length === 0 && <div className="aspect-square rounded-xl bg-gold-soft/30" />}
        {media.map((m, i) =>
          m.kind === "video" ? (
            <video key={m.storage_path} src={mediaUrl(m.storage_path)} controls playsInline muted className="w-full rounded-xl" />
          ) : (
            <img key={m.storage_path} src={mediaUrl(m.storage_path)} alt={m.alt || p.name} className="w-full rounded-xl" loading={i ? "lazy" : "eager"} />
          ),
        )}
      </div>

      <div className="md:sticky md:top-20 md:self-start">
        <h1 className="font-serif text-4xl">{p.name}</h1>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {eur(p.price_cents)}
          {p.compare_at_cents && <span className="ml-2 text-base font-normal text-muted line-through">{eur(p.compare_at_cents)}</span>}
        </p>
        <p className="text-xs text-muted">IVA incluido</p>

        {variants.length > 0 ? (
          <form action={addToCart} className="mt-6 space-y-3">
            {variants.length > 1 ? (
              <label className="block text-sm">Opción
                <select name="variant" className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2">
                  {variants.map((v: { id: string; title: string; price_cents: number | null }) => (
                    <option key={v.id} value={v.id}>{v.title}{v.price_cents ? ` · ${eur(v.price_cents)}` : ""}</option>
                  ))}
                </select>
              </label>
            ) : <input type="hidden" name="variant" value={variants[0].id} />}
            <div className="flex gap-2">
              <input name="qty" type="number" min={1} max={20} defaultValue={1} aria-label="Cantidad"
                className="w-20 rounded-md border border-border bg-surface px-3 py-2" />
              <button className={`${btn} flex-1 py-3`}>Añadir al carrito</button>
            </div>
          </form>
        ) : <p className="mt-6 font-medium text-danger">Agotado</p>}

        <p className="mt-6 whitespace-pre-line text-sm leading-relaxed">{p.description}</p>
        {p.bullets?.length > 0 && <ul className="mt-4 space-y-1 text-sm">{p.bullets.map((b: string) => <li key={b}>✓ {b}</li>)}</ul>}

        <details className="mt-6 rounded-md border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Envío y devoluciones</summary>
          <p className="mt-2 text-muted">Envío desde un almacén en la UE. Tienes 14 días para devolverlo desde que lo recibes.</p>
        </details>
        <details className="mt-2 rounded-md border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Seguridad del producto (GPSR)</summary>
          <dl className="mt-2 space-y-1 text-muted">
            <div><dt className="inline font-medium text-foreground">Fabricante / responsable: </dt><dd className="inline">{p.gpsr_manufacturer}</dd></div>
            <div><dt className="inline font-medium text-foreground">Dirección: </dt><dd className="inline">{p.gpsr_address}</dd></div>
            <div><dt className="inline font-medium text-foreground">Contacto: </dt><dd className="inline">{p.gpsr_contact}</dd></div>
            {p.gpsr_warnings && <div><dt className="inline font-medium text-foreground">Advertencias: </dt><dd className="inline">{p.gpsr_warnings}</dd></div>}
          </dl>
        </details>
      </div>
    </main>
  );
}
