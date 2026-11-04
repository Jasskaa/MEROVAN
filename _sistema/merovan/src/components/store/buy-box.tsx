"use client";

import { useState } from "react";
import { eur } from "@/lib/format";

export interface BuyVariant { id: string; title: string; price_cents: number | null; stock: number }

// Variant pills, quantity stepper and add-to-cart; also renders a sticky bar on mobile.
export function BuyBox({ variants, basePrice, action, name }: {
  variants: BuyVariant[];
  basePrice: number;
  action: (formData: FormData) => Promise<void>;
  name: string;
}) {
  const available = variants.filter((v) => v.stock > 0);
  const [variant, setVariant] = useState(available[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const current = available.find((v) => v.id === variant);
  const price = current?.price_cents ?? basePrice;
  const max = Math.min(20, current?.stock ?? 0);
  const lowStock = current && current.stock <= 5;

  if (available.length === 0) {
    return <p className="mt-8 border border-line py-4 text-center text-sm uppercase tracking-[0.2em] text-stone">Agotado temporalmente</p>;
  }

  return (
    <form action={action} className="mt-8 space-y-6">
      <input type="hidden" name="variant" value={variant} />
      <input type="hidden" name="qty" value={qty} />

      {available.length > 1 && (
        <fieldset>
          <legend className="mb-3 text-[11px] uppercase tracking-[0.22em] text-stone">Opción</legend>
          <div className="flex flex-wrap gap-2">
            {available.map((v) => (
              <button type="button" key={v.id} onClick={() => { setVariant(v.id); setQty(1); }} aria-pressed={v.id === variant}
                className={`rounded-full border px-4 py-2.5 text-sm transition ${v.id === variant ? "border-ink bg-ink text-ivory" : "border-line hover:border-ink"}`}>
                {v.title}{v.price_cents && v.price_cents !== basePrice ? ` · ${eur(v.price_cents)}` : ""}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex gap-3">
        <div className="flex items-center rounded-full border border-line">
          <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} className="h-12 w-11 text-lg hover:bg-sand" aria-label="Quitar una unidad">−</button>
          <span className="w-8 text-center tabular-nums" aria-live="polite">{qty}</span>
          <button type="button" onClick={() => setQty(Math.min(max, qty + 1))} className="h-12 w-11 text-lg hover:bg-sand" aria-label="Añadir una unidad">+</button>
        </div>
        <button className="h-12 flex-1 rounded-full bg-ink text-sm font-medium uppercase tracking-[0.2em] text-ivory transition hover:bg-ink-soft">
          Añadir al carrito · {eur(price * qty)}
        </button>
      </div>
      {lowStock && <p className="text-sm text-brass">Quedan pocas unidades ({current!.stock}).</p>}

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-ivory/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{name}</p>
          <p className="text-sm tabular-nums">{eur(price)}</p>
        </div>
        <button className="h-11 rounded-full bg-ink px-5 text-xs font-medium uppercase tracking-[0.18em] text-ivory">Añadir</button>
      </div>
    </form>
  );
}
