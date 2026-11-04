"use client";

import { useActionState } from "react";
import { Monogram } from "@/components/store/logo";
import { login } from "./actions";

const field = "mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 outline-none focus:border-gold focus:ring-2 focus:ring-gold-soft";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#0e0e0d] p-12 text-[#f5f4f0] lg:flex lg:flex-col lg:justify-between">
        <span className="flex items-center gap-2.5"><Monogram size={36} id="mv-login" /><span className="font-display text-xl tracking-[0.14em]">MEROVAN</span></span>
        <p aria-hidden className="select-none font-display text-[9rem] leading-[0.85] text-white/[0.06]">PANEL</p>
        <p className="max-w-sm text-sm text-white/60">Productos, pedidos, márgenes y decisiones en un solo sitio.</p>
      </section>
      <section className="flex items-center justify-center px-4">
        <form action={action} className="w-full max-w-sm space-y-4">
          <div className="mb-8 lg:hidden"><Monogram size={44} id="mv-login-m" /></div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel MEROVAN</h1>
          <p className="text-sm text-muted">Acceso solo para el equipo.</p>
          <label className="block text-sm font-medium">Correo
            <input name="email" type="email" required autoComplete="email" className={field} />
          </label>
          <label className="block text-sm font-medium">Contraseña
            <input name="password" type="password" required autoComplete="current-password" className={field} />
          </label>
          {error && <p role="alert" className="rounded-xl bg-[#fef3f2] px-3 py-2 text-sm text-danger">{error}</p>}
          <button disabled={pending} className="h-11 w-full rounded-xl bg-[#0e0e0d] font-medium text-white transition hover:opacity-90 disabled:opacity-60">
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
