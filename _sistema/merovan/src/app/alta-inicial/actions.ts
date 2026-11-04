"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Escribe tu nombre"),
    email: z.string().email("Correo no válido"),
    password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Las contraseñas no coinciden" });

// One-time setup: creates the first account, which the database turns into the owner.
export async function createOwner(_prev: string | null, formData: FormData): Promise<string | null> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return parsed.error.issues[0].message;
  const { full_name, email, password } = parsed.data;

  const supabase = await createClient();
  const { data: exists } = await supabase.rpc("owner_exists");
  if (exists) return "Ya existe un owner. Entra desde el login.";

  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
  if (error) return `No se pudo crear la cuenta: ${error.message}`;

  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
  if (loginError) return "Cuenta creada. Entra desde el login.";
  redirect("/admin");
}
