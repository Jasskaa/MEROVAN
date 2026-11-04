import Link from "next/link";
import { IconBag, IconMenu, IconStar } from "@/components/store/icons";
import { Logo, Monogram } from "@/components/store/logo";
import { LEGAL } from "@/lib/legal";
import { cartLines } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/server";

const NAV = [
  { href: "/#coleccion", label: "Productos" },
  { href: "/#ofertas", label: "Ofertas" },
  { href: "/#filosofia", label: "Cómo trabajamos" },
  { href: "/#ayuda", label: "Ayuda" },
];

const PROMISES = ["Envío desde almacén en la UE", "14 días para devolverlo", "Pago 100 % seguro con Stripe"];

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const count = supabaseConfigured ? (await cartLines()).reduce((s, l) => s + l.quantity, 0) : 0;
  return (
    <div className="flex min-h-screen flex-col bg-ivory text-ink">
      {/* Announcement bar */}
      <div className="bg-ink text-[11px] uppercase tracking-[0.22em] text-champagne/90">
        <div className="no-scrollbar mx-auto flex max-w-7xl items-center justify-center gap-6 overflow-x-auto whitespace-nowrap px-4 py-2">
          {PROMISES.map((p, i) => (
            <span key={p} className={`flex items-center gap-6 ${i > 0 ? "hidden sm:flex" : ""}`}>
              {i > 0 && <IconStar className="text-brass" />}{p}
            </span>
          ))}
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/90 text-ivory backdrop-blur-md">
        <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 py-3 sm:px-6">
          <nav className="hidden gap-8 text-[13px] tracking-wide text-ivory/80 md:flex">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="transition hover:text-champagne">{n.label}</Link>)}
          </nav>
          <details className="relative md:hidden">
            <summary className="list-none cursor-pointer p-1" aria-label="Menú"><IconMenu /></summary>
            <nav className="absolute left-0 top-10 w-56 border border-white/10 bg-ink p-4 text-sm shadow-2xl">
              {NAV.map((n) => <Link key={n.href} href={n.href} className="block py-2 text-ivory/90">{n.label}</Link>)}
            </nav>
          </details>
          <Link href="/" aria-label="MEROVAN, inicio" className="justify-self-center">
            <span className="hidden sm:inline"><Logo size={28} /></span>
            <span className="sm:hidden"><Monogram size={30} id="mv-m" /></span>
          </Link>
          <Link href="/carrito" className="relative justify-self-end p-1 transition hover:text-champagne" aria-label={`Carrito, ${count} productos`}>
            <IconBag className="h-6 w-6" />
            {count > 0 && (
              <span className="absolute -right-1 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-champagne px-1 text-[10px] font-semibold text-ink">
                {count}
              </span>
            )}
          </Link>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      {/* Footer */}
      <footer className="bg-ink text-ivory/70">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo size={40} />
            <p className="mt-5 max-w-sm text-sm leading-relaxed">
              Seleccionamos pocos productos, los probamos antes de venderlos y los enviamos desde almacenes en la Unión Europea.
            </p>
          </div>
          <div>
            <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-champagne">Tienda</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/#coleccion" className="hover:text-ivory">Colección</Link></li>
              <li><Link href="/carrito" className="hover:text-ivory">Carrito</Link></li>
              <li><Link href="/#ayuda" className="hover:text-ivory">Preguntas frecuentes</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-champagne">Legal</p>
            <ul className="space-y-2 text-sm">
              {LEGAL.map((l) => <li key={l.slug}><Link href={`/legal/${l.slug}`} className="hover:text-ivory">{l.label}</Link></li>)}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6">
            <span>© {new Date().getFullYear()} MEROVAN. Todos los derechos reservados.</span>
            <span className="flex items-center gap-2 text-ivory/60">
              Pago seguro · Visa · Mastercard · Apple Pay · Google Pay
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
