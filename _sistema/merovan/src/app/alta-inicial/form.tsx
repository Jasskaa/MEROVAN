"use client";

import Image from "next/image";
import { useActionState } from "react";
import { createOwner } from "./actions";

const field = "mt-1 w-full rounded-md border border-[#2a2620] bg-transparent px-3 py-2 outline-none focus:border-[#d4b483]";

export function SetupForm() {
  const [error, action, pending] = useActionState(createOwner, null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0a08] px-4 py-8">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl border border-[#2a2620] bg-[#15130f] p-8 text-[#f2ece1]">
        <Image src="/logo-merovan.webp" alt="MEROVAN" width={240} height={160} className="mx-auto" priority />
        <h1 className="text-center text-xl font-semibold tracking-widest">Alta inicial</h1>
        <p className="text-center text-sm text-[#a39a8a]">
          Crea la cuenta del owner. Solo se puede hacer una vez; al resto del equipo lo darás de alta desde el panel.
        </p>
        <label className="block text-sm">Nombre<input name="full_name" required autoComplete="name" className={field} /></label>
        <label className="block text-sm">Correo<input name="email" type="email" required autoComplete="email" className={field} /></label>
        <label className="block text-sm">
          Contraseña (mín. 10)
          <input name="password" type="password" required minLength={10} autoComplete="new-password" className={field} />
        </label>
        <label className="block text-sm">
          Repite la contraseña
          <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={field} />
        </label>
        {error && <p role="alert" className="text-sm text-[#f97066]">{error}</p>}
        <button disabled={pending}
          className="w-full rounded-md bg-[#d4b483] py-2 font-medium text-[#0b0a08] hover:bg-[#e0c697] disabled:opacity-60">
          {pending ? "Creando…" : "Crear cuenta de owner"}
        </button>
      </form>
    </main>
  );
}
