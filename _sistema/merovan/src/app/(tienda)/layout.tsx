import Link from "next/link";
import { IconBag, IconMenu } from "@/components/store/icons";
import { IconSearch } from "@/components/store/icons-extra";
import { Logo } from "@/components/store/logo";
import { LEGAL } from "@/lib/legal";
import { cartLines } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/server";

const NAV = [
  { href: "/#novedades", label: "Novedades" },
  { href: "/#productos", label: "Todo" },
  { href: "/#ofertas", label: "Ofertas" },
  { href: "/#nosotros", label: "Nosotros" },
  { href: "/#ayuda", label: "Ayuda" },
];

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const count = supabaseConfigured ? (await cartLines()).reduce((s, l) => s + l.quantity, 0) : 0;
  return (
    <div className="flex min-h-screen flex-col bg-ivory text-ink">
      <p className="bg-ink px-4 py-2 text-center text-[11px] tracking-wide text-ivory/85">
        Envío desde almacenes en la UE · 14 días para devolverlo · Pago seguro con Stripe
      </p>

      <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <details className="relative md:hidden">
            <summary className="list-none cursor-pointer rounded-full p-2 hover:bg-sand" aria-label="Menú"><IconMenu /></summary>
            <nav className="absolute left-0 top-12 w-56 rounded-2xl border border-line bg-ivory p-2 shadow-xl">
              {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-xl px-3 py-2 text-sm hover:bg-sand">{n.label}</Link>)}
            </nav>
          </details>

          <Link href="/" aria-label="MEROVAN, inicio" className="shrink-0"><Logo tone="dark" size={30} /></Link>

          <nav className="mx-auto hidden items-center gap-1 rounded-full bg-sand p-1 text-[13px] md:flex">
            {NAV.map((n, i) => (
              <Link key={n.href} href={n.href}
                className={`rounded-full px-4 py-1.5 transition ${i === 0 ? "bg-ink text-ivory" : "text-ink/75 hover:bg-ivory hover:text-ink"}`}>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <form action="/" className="hidden items-center gap-2 rounded-full bg-sand px-4 py-2 lg:flex">
              <input name="q" placeholder="Buscar productos" aria-label="Buscar productos"
                className="w-40 bg-transparent text-sm outline-none placeholder:text-stone" />
              <button aria-label="Buscar"><IconSearch className="text-stone" /></button>
            </form>
            <Link href="/carrito" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-ink text-ivory transition hover:bg-ink-soft"
              aria-label={`Carrito, ${count} productos`}>
              <IconBag className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-champagne px-1 text-[10px] font-semibold text-ink">{count}</span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-10 bg-ink text-ivory/70">
        <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <Logo size={34} />
              <p className="mt-5 max-w-sm text-sm leading-relaxed">Productos útiles, probados antes de venderlos y enviados desde almacenes en la Unión Europea.</p>
            </div>
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-ivory">Tienda</p>
              <ul className="space-y-2 text-sm">
                {NAV.slice(0, 3).map((n) => <li key={n.href}><Link href={n.href} className="hover:text-ivory">{n.label}</Link></li>)}
                <li><Link href="/carrito" className="hover:text-ivory">Carrito</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-ivory">Ayuda</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#ayuda" className="hover:text-ivory">Preguntas frecuentes</Link></li>
                <li><Link href="/legal/envios-y-devoluciones" className="hover:text-ivory">Envíos y devoluciones</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-ivory">Legal</p>
              <ul className="space-y-2 text-sm">
                {LEGAL.filter((l) => l.slug !== "envios-y-devoluciones").map((l) => <li key={l.slug}><Link href={`/legal/${l.slug}`} className="hover:text-ivory">{l.label}</Link></li>)}
              </ul>
            </div>
          </div>
          <p aria-hidden className="mt-14 select-none text-center font-display text-[22vw] leading-[0.8] tracking-tight text-white/[0.04] md:text-[17vw]">MEROVAN</p>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6">
            <span>© {new Date().getFullYear()} MEROVAN</span>
            <span>Visa · Mastercard · Apple Pay · Google Pay</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
