"use client";
/* eslint-disable @next/next/no-img-element -- product media is served from Supabase Storage */

import { useRef, useState } from "react";
import { ImagePlaceholder } from "./product-card";

export interface GalleryItem { url: string; kind: "image" | "video"; alt: string }

// Product gallery: large view with zoom-on-hover (desktop), swipe (mobile), arrows and thumbnails.
export function Gallery({ items, name }: { items: GalleryItem[]; name: string }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const track = useRef<HTMLDivElement>(null);

  if (items.length === 0) return <ImagePlaceholder className="aspect-[4/5] w-full rounded-sm" />;

  const go = (i: number) => {
    const next = (i + items.length) % items.length;
    setActive(next);
    track.current?.children[next]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      {items.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto lg:max-h-[640px] lg:w-20 lg:flex-col lg:overflow-y-auto">
          {items.map((m, i) => (
            <button key={m.url} onClick={() => go(i)} aria-label={`Ver imagen ${i + 1}`}
              className={`relative aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-sm border transition lg:w-full ${i === active ? "border-ink" : "border-transparent opacity-60 hover:opacity-100"}`}>
              {m.kind === "video"
                ? <><video src={m.url} muted className="h-full w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center text-white">▶</span></>
                : <img src={m.url} alt="" className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
      )}

      <div className="relative flex-1">
        <div ref={track}
          onScroll={(e) => { const el = e.currentTarget; setActive(Math.round(el.scrollLeft / el.clientWidth)); }}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-sm bg-sand">
          {items.map((m, i) => (
            <div key={m.url} className="relative aspect-[4/5] w-full shrink-0 snap-start overflow-hidden">
              {m.kind === "video" ? (
                <video src={m.url} controls playsInline muted loop className="h-full w-full object-cover" />
              ) : (
                <img src={m.url} alt={m.alt || `${name}, imagen ${i + 1}`} loading={i ? "lazy" : "eager"}
                  onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                  }}
                  onMouseLeave={() => setZoom(null)}
                  style={zoom && i === active ? { transform: "scale(1.8)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
                  className="h-full w-full cursor-zoom-in object-cover transition-transform duration-200" />
              )}
            </div>
          ))}
        </div>
        {items.length > 1 && (
          <>
            <button onClick={() => go(active - 1)} aria-label="Imagen anterior"
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/90 text-ink shadow transition hover:bg-ivory sm:flex">‹</button>
            <button onClick={() => go(active + 1)} aria-label="Imagen siguiente"
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ivory/90 text-ink shadow transition hover:bg-ivory sm:flex">›</button>
            <span className="absolute bottom-3 right-3 bg-ink/70 px-2 py-1 text-[11px] tabular-nums text-ivory">{active + 1} / {items.length}</span>
          </>
        )}
      </div>
    </div>
  );
}
