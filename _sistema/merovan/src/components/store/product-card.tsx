/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */
import Link from "next/link";
import { eur } from "@/lib/format";

export interface CardProduct {
  code: string;
  name: string;
  slug: string;
  price_cents: number | null;
  compare_at_cents: number | null;
  images: string[];
}

export const discountPct = (price: number | null, compare: number | null) =>
  price && compare && compare > price ? Math.round((1 - price / compare) * 100) : null;

/** Empty-photo state: soft studio gradient with a discreet label (never a broken image). */
export function ImagePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_35%,#fbf8f2,#e3d8c5)] text-stone/70 ${className}`}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="1.5" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" />
      </svg>
      <span className="text-[10px] uppercase tracking-[0.25em]">Foto próximamente</span>
    </div>
  );
}

export function ProductCard({ p, priority = false }: { p: CardProduct; priority?: boolean }) {
  const off = discountPct(p.price_cents, p.compare_at_cents);
  return (
    <Link href={`/p/${p.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-sand">
        {p.images[0] ? (
          <>
            <img src={p.images[0]} alt={p.name} loading={priority ? "eager" : "lazy"}
              className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]" />
            {p.images[1] && (
              <img src={p.images[1]} alt="" loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-700 group-hover:opacity-100" />
            )}
          </>
        ) : (
          <ImagePlaceholder className="absolute inset-0 transition duration-700 group-hover:scale-[1.04]" />
        )}
        {off && <span className="absolute left-3 top-3 bg-ink px-2 py-1 text-[11px] font-medium tracking-wider text-champagne">−{off} %</span>}
        <span className="absolute inset-x-3 bottom-3 translate-y-2 bg-ivory/95 py-2.5 text-center text-xs font-medium uppercase tracking-[0.2em] text-ink opacity-0 backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          Ver producto
        </span>
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <h3 className="font-serif text-xl leading-tight text-ink">{p.name}</h3>
        {p.price_cents != null && (
          <p className="shrink-0 text-right text-sm tabular-nums text-ink">
            {eur(p.price_cents)}
            {off && <span className="block text-xs text-stone line-through">{eur(p.compare_at_cents!)}</span>}
          </p>
        )}
      </div>
    </Link>
  );
}
