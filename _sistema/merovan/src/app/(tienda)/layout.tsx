import Image from "next/image";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { cartLines } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/server";


export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const count = supabaseConfigured ? (await cartLines()).reduce((s, l) => s + l.quantity, 0) : 0;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-[#0b0a08]/95 text-[#f2ece1] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-merovan.webp" alt="" width={48} height={32} />
            <span className="font-serif text-xl tracking-widest">MEROVAN</span>
          </Link>
          <Link href="/carrito" className="rounded-full border border-[#2a2620] px-3 py-1 text-sm hover:border-[#d4b483]">
            Carrito <span className="tabular-nums text-[#d4b483]">({count})</span>
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border py-8 text-center text-xs text-muted">
        <nav className="mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {LEGAL.map((l) => <Link key={l.slug} href={`/legal/${l.slug}`} className="hover:text-gold">{l.label}</Link>)}
        </nav>
        © {new Date().getFullYear()} MEROVAN · Pago seguro con Stripe · Envío desde la UE · 14 días de desistimiento
      </footer>
    </div>
  );
}
