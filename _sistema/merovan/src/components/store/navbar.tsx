"use client";

// Store header navigation: highlights the section in view on the home page, a mobile panel that
// closes on navigation or Escape, and search available at every size.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconBag, IconMenu } from "./icons";
import { IconSearch } from "./icons-extra";
import { Logo } from "./logo";
import { NAV } from "./shell";


function IconClose({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Search({ className = "", onDone }: { className?: string; onDone?: () => void }) {
  return (
    <form action="/" onSubmit={onDone} className={`flex items-center gap-2 rounded-full bg-sand px-4 py-2.5 ${className}`}>
      <IconSearch className="h-4 w-4 shrink-0 text-stone" />
      <input name="q" type="search" placeholder="Buscar productos" aria-label="Buscar productos"
        className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-stone" />
    </form>
  );
}

export function NavBar({ count }: { count: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // Highlight the home section in view; elsewhere nothing is highlighted.
  useEffect(() => {
    if (pathname !== "/") { setActive(null); return; }
    const sections = NAV.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (seen) setActive(seen.target.id);
    }, { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5] });
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/90 backdrop-blur-md">
      <div className="mx-auto grid h-16 w-full max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-10">
        <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="menu-movil"
          aria-label={open ? "Cerrar menú" : "Abrir menú"} className="-ml-2 rounded-full p-2 hover:bg-sand md:hidden">
          {open ? <IconClose /> : <IconMenu />}
        </button>

        <Link href="/" onClick={close} aria-label="MEROVAN, inicio" className="shrink-0"><Logo tone="dark" size={30} /></Link>
        </div>

        {/* Centred main menu (desktop) */}
        <nav aria-label="Principal" className="hidden items-center gap-1 rounded-full bg-sand p-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active === n.id ? "true" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] transition lg:px-5 ${active === n.id || pathname.startsWith(n.href) ? "bg-ink text-ivory" : "text-ink/70 hover:bg-ivory hover:text-ink"}`}>
              {n.label}
            </Link>
          ))}
        </nav>

        <span className="md:hidden" aria-hidden />
        <div className="flex items-center justify-end gap-2">
          <Search className="hidden w-56 lg:flex xl:w-72" />
          <Link href="/carrito" onClick={close} aria-label={`Carrito, ${count} productos`}
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-ink text-ivory transition hover:bg-ink-soft">
            <IconBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-champagne px-1 text-[10px] font-semibold text-ink">{count}</span>
            )}
          </Link>
        </div>
      </div>

      {/* Mobile panel */}
      <div id="menu-movil" hidden={!open} className="border-t border-line bg-ivory md:hidden">
        <div className="h-[calc(100dvh-4rem)] overflow-y-auto px-4 pb-8 pt-4">
          <Search onDone={close} />
          <nav aria-label="Menú móvil" className="mt-4 divide-y divide-line">
            {[{ href: "/", id: "inicio", label: "Inicio" }, ...NAV, { href: "/carrito", id: "carrito", label: "Carrito" }].map((n) => (
              <Link key={n.href} href={n.href} onClick={close} className="flex items-center justify-between py-4 font-display text-3xl uppercase">
                {n.label}<span aria-hidden className="text-base text-stone">→</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
