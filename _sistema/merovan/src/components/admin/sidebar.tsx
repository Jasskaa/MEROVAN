"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Monogram } from "@/components/store/logo";
import type { NavIcon } from "@/lib/nav";

const PATHS: Record<NavIcon, string> = {
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4",
  lifebuoy: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6",
  cart: "M3 4h2l2.4 11h10.2L20 8H6.2M9 20h.01M17 20h.01",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  coins: "M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  calc: "M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01",
  megaphone: "M3 10v4h4l7 4V6L7 10zM17 9a4 4 0 0 1 0 6",
  check: "M5 12l4.5 4.5L19 7M3 3h18v18H3z",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
};

export function NavGlyph({ name, className = "h-[18px] w-[18px]" }: { name: NavIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

export interface SideItem { href: string; label: string; icon: NavIcon; group: string; badge?: number }

export function Sidebar({ items }: { items: SideItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const groups = [...new Set(items.map((i) => i.group))];
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  return (
    <>
      <button onClick={() => setOpen(!open)} aria-label="Menú" className="fixed left-3 top-3 z-50 rounded-xl border border-border bg-surface p-2 md:hidden">
        <NavGlyph name="sliders" />
      </button>
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-surface transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0e0e0d]"><Monogram size={26} id="mv-admin" /></span>
          <div className="leading-tight">
            <p className="font-display text-base tracking-[0.12em]">MEROVAN</p>
            <p className="text-[11px] text-muted">Panel de gestión</p>
          </div>
        </div>
        <nav className="h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4" onClick={() => setOpen(false)}>
          {groups.map((g) => (
            <div key={g} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted">{g}</p>
              {items.filter((i) => i.group === g).map((i) => (
                <Link key={i.href} href={i.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active(i.href) ? "bg-[#0e0e0d] text-white" : "text-foreground/80 hover:bg-background hover:text-foreground"}`}>
                  <NavGlyph name={i.icon} />
                  <span className="flex-1">{i.label}</span>
                  {i.badge ? <span className={`rounded-full px-1.5 text-[11px] font-semibold ${active(i.href) ? "bg-white/20" : "bg-gold-soft text-gold"}`}>{i.badge}</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
