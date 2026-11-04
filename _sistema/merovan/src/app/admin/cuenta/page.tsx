import { redirect } from "next/navigation";
import { Card, Field, Notice, btn, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mi cuenta" };

async function changePassword(formData: FormData) {
  "use server";
  await requireRole();
  const password = String(formData.get("password"));
  if (password.length < 10) redirect("/admin/cuenta?error=" + encodeURIComponent("Mínimo 10 caracteres"));
  if (password !== String(formData.get("confirm"))) redirect("/admin/cuenta?error=" + encodeURIComponent("Las contraseñas no coinciden"));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/admin/cuenta?error=" + encodeURIComponent(error.message));
  redirect("/admin/cuenta?ok=1");
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole();
  const { ok, error } = await searchParams;
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="font-serif text-3xl">Mi cuenta</h1>
      <p className="text-sm text-muted">{staff.name} · {staff.email} · rol <strong>{staff.role}</strong></p>
      {ok && <Notice tone="ok">Contraseña cambiada</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <Card title="Cambiar contraseña">
        <form action={changePassword} className="space-y-3">
          <Field label="Nueva contraseña" hint="mín. 10"><input name="password" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <Field label="Repítela"><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={input} /></Field>
          <button className={btn}>Guardar</button>
        </form>
      </Card>
    </div>
  );
}
