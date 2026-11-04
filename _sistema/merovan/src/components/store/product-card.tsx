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
  variants: number;
  isNew: boolean;
}

export const discountPct = (price: number | null, compare: number | null) =>
  price && compare && compare > price ? Math.round((1 - price / compare) * 100) : null;

/** Empty-photo state: studio-grey tile with a discreet label (never a broken image). */
export function ImagePlaceholder({ className = "", dark = false, compact = false }: { className?: string; dark?: boolean; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${dark ? "bg-white/5 text-white/40" : "bg-sand text-stone/70"} ${className}`}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="1.5" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" />
      </svg>
      {!compact && <span className="text-[10px] uppercase tracking-[0.25em]">Foto próximamente</span>}
    </div>
  );
}

export function ProductCard({ p, priority = false }: { p: CardProduct; priority?: boolean }) {
  const off = discountPct(p.price_cents, p.compare_at_cents);
  return (
    <Link href={`/p/${p.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-sand">
        {p.images[0] ? (
          <>
            <img src={p.images[0]} alt={p.name} loading={priority ? "eager" : "lazy"}
              className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-105" />
            {p.images[1] && (
              <img src={p.images[1]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />
            )}
          </>
        ) : <ImagePlaceholder className="absolute inset-0" />}
        {p.isNew && (
          <span className="absolute left-3 top-3 origin-top-left translate-y-14 -rotate-90 rounded-sm bg-ivory px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]">
            Nuevo
          </span>
        )}
        {off && <span className="absolute right-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-ivory">−{off}%</span>}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{p.name}</h3>
          {p.price_cents != null && (
            <p className="mt-0.5 text-sm tabular-nums">
              {eur(p.price_cents)}
              {off && <span className="ml-2 text-stone line-through">{eur(p.compare_at_cents!)}</span>}
            </p>
          )}
        </div>
        {p.variants > 1 && (
          <span className="mt-1 flex shrink-0 gap-1" aria-label={`${p.variants} opciones`}>
            {Array.from({ length: Math.min(p.variants, 4) }).map((_, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${["bg-ink", "bg-stone", "bg-line", "bg-champagne"][i]}`} />
            ))}
          </span>
        )}
      </div>
    </Link>
  );
}
