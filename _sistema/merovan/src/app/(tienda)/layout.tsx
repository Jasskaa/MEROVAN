import Link from "next/link";
import { Logo } from "@/components/store/logo";
import { NavBar } from "@/components/store/navbar";
import { NAV, SHELL } from "@/components/store/shell";
import { LEGAL } from "@/lib/legal";
import { cartLines } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/server";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const count = supabaseConfigured ? (await cartLines()).reduce((s, l) => s + l.quantity, 0) : 0;
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-ivory text-ink">
      <p className="bg-ink px-4 py-2 text-center text-[11px] tracking-wide text-ivory/85">
        Envío desde almacenes en la UE<span className="hidden sm:inline"> · 14 días para devolverlo · Pago seguro con Stripe</span>
      </p>

      <NavBar count={count} />

      <div className="flex-1">{children}</div>

      <footer className="mt-10 bg-ink text-ivory/70">
        <div className={`${SHELL} pt-16`}>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <Logo size={34} />
              <p className="mt-5 max-w-sm text-sm leading-relaxed">Productos útiles, probados antes de venderlos y enviados desde almacenes en la Unión Europea.</p>
            </div>
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-ivory">Tienda</p>
              <ul className="space-y-2 text-sm">
                {NAV.map((n) => <li key={n.href}><Link href={n.href} className="hover:text-ivory">{n.label}</Link></li>)}
                <li><Link href="/carrito" className="hover:text-ivory">Carrito</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-ivory">Ayuda</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#ayuda" className="hover:text-ivory">Preguntas frecuentes</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-ivory">Legal</p>
              <ul className="space-y-2 text-sm">
                {LEGAL.filter((l) => l.slug !== "envios-y-devoluciones").map((l) => <li key={l.slug}><Link href={`/legal/${l.slug}`} className="hover:text-ivory">{l.label}</Link></li>)}
              </ul>
            </div>
          </div>
          <p aria-hidden className="mt-14 select-none text-center font-display text-[22vw] leading-[0.8] tracking-tight text-white/[0.04] lg:text-[15vw]">MEROVAN</p>
        </div>
        <div className="border-t border-white/10">
          <div className={`${SHELL} flex flex-wrap items-center justify-between gap-3 py-6 text-xs`}>
            <span>© {new Date().getFullYear()} MEROVAN</span>
            <span>Visa · Mastercard · Apple Pay · Google Pay</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
