import Image from "next/image";
import Link from "next/link";
import { eur } from "@/lib/nav";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

// Public storefront home: lists published products (RLS hides the rest).
export const revalidate = 60;

export default async function StoreHome() {
  const products = supabaseConfigured
    ? ((await (await createClient()).from("products").select("code, name, slug, price_cents, bullets").order("code")).data ?? [])
    : [];

  return (
    <div>
      <header className="bg-[#0b0a08] text-[#f2ece1]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-merovan.webp" alt="" width={48} height={32} />
            <span className="font-serif text-xl tracking-widest">MEROVAN</span>
          </Link>
          <span className="text-sm text-[#a39a8a]">Carrito (0)</span>
        </div>
      </header>

      <section className="bg-[#0b0a08] pb-16 pt-8 text-center text-[#f2ece1]">
        <Image src="/logo-merovan.webp" alt="MEROVAN" width={420} height={280} className="mx-auto h-auto w-72 md:w-[420px]" priority />
        <p className="mt-2 text-sm tracking-[0.3em] text-[#d4b483]">ENVÍO DESDE LA UE · DEVOLUCIÓN 14 DÍAS</p>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="mb-6 font-serif text-3xl">Productos</h1>
        {!supabaseConfigured && <p className="text-muted">Tienda en preparación.</p>}
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p.code} className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-4 aspect-square rounded-lg bg-gold-soft/30" aria-hidden />
              <h2 className="font-serif text-xl">{p.name}</h2>
              {p.price_cents != null && <p className="mt-1 font-semibold tabular-nums">{eur(p.price_cents)}</p>}
              <ul className="mt-2 text-sm text-muted">
                {(p.bullets as string[]).map((b) => <li key={b}>· {b}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted">
        © {new Date().getFullYear()} MEROVAN · Aviso legal · Privacidad · Cookies · Envíos y devoluciones
      </footer>
    </div>
  );
}
