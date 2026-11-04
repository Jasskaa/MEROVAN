/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */
import Image from "next/image";
import Link from "next/link";
import { eur } from "@/lib/format";
import { mediaUrl, trackView } from "@/lib/store";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Public storefront home: lists published products (RLS hides the rest).
export default async function StoreHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (supabaseConfigured) await trackView("/", null, await searchParams);
  const products = supabaseConfigured
    ? ((await (await createClient())
        .from("products")
        .select("code, name, slug, price_cents, compare_at_cents, bullets, product_media(storage_path, kind, position)")
        .order("code")).data ?? [])
    : [];

  return (
    <div>
      <section className="bg-[#0b0a08] pb-16 pt-6 text-center text-[#f2ece1]">
        <Image src="/logo-merovan.webp" alt="MEROVAN" width={420} height={280} className="mx-auto h-auto w-72 md:w-[420px]" priority />
        <p className="mt-2 text-sm tracking-[0.3em] text-[#d4b483]">ENVÍO DESDE LA UE · DEVOLUCIÓN 14 DÍAS</p>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="mb-6 font-serif text-3xl">Productos</h1>
        {products.length === 0 && <p className="text-muted">Tienda en preparación.</p>}
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const img = p.product_media?.filter((m) => m.kind === "image").sort((a, b) => a.position - b.position)[0];
            return (
              <li key={p.code}>
                <Link href={`/p/${p.slug}`} className="group block rounded-xl border border-border bg-surface p-4 hover:border-gold">
                  <div className="mb-4 aspect-square overflow-hidden rounded-lg bg-gold-soft/30">
                    {img && <img src={mediaUrl(img.storage_path)} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />}
                  </div>
                  <h2 className="font-serif text-xl">{p.name}</h2>
                  {p.price_cents != null && (
                    <p className="mt-1 font-semibold tabular-nums">
                      {eur(p.price_cents)}
                      {p.compare_at_cents && <span className="ml-2 text-sm font-normal text-muted line-through">{eur(p.compare_at_cents)}</span>}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
