"use client";

import Image from "next/image";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0a08] px-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl border border-[#2a2620] bg-[#15130f] p-8 text-[#f2ece1]">
        <Image src="/logo-merovan.webp" alt="MEROVAN" width={240} height={160} className="mx-auto" priority />
        <h1 className="text-center font-serif text-2xl tracking-widest">Panel MEROVAN</h1>
        <label className="block text-sm">
          Correo
          <input name="email" type="email" required autoComplete="email"
            className="mt-1 w-full rounded-md border border-[#2a2620] bg-transparent px-3 py-2 outline-none focus:border-[#d4b483]" />
        </label>
        <label className="block text-sm">
          Contraseña
          <input name="password" type="password" required autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-[#2a2620] bg-transparent px-3 py-2 outline-none focus:border-[#d4b483]" />
        </label>
        {error && <p role="alert" className="text-sm text-[#f97066]">{error}</p>}
        <button disabled={pending}
          className="w-full rounded-md bg-[#d4b483] py-2 font-medium text-[#0b0a08] hover:bg-[#e0c697] disabled:opacity-60">
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
