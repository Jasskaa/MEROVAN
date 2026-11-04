import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, Field, Notice, Table, btn, btnGhost, input } from "@/components/ui";
import { audit, requireRole, serviceClient } from "@/lib/admin";
import { date } from "@/lib/format";
import { ROLES } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Equipo" };

const TEMP_COOKIE = "merovan_temp_password";

const ROLE_HELP: Record<string, string> = {
  owner: "Todo, incluidas aprobaciones, ajustes y equipo",
  producto: "Productos, proveedores, muestras, márgenes",
  marketing: "Productos (sin costes), fotos/vídeos, marketing",
  operaciones: "Pedidos, proveedores, soporte",
  finanzas: "Dinero, pedidos, ajustes, márgenes",
  lectura: "Solo consulta del catálogo y el panel",
};

const newMember = z.object({
  full_name: z.string().trim().min(2, "Escribe el nombre"),
  email: z.string().email("Correo no válido"),
  role: z.enum(ROLES).exclude(["owner"]),
});

async function createMember(formData: FormData) {
  "use server";
  await requireRole("owner");
  const parsed = newMember.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/equipo?error=" + encodeURIComponent(parsed.error.issues[0].message));
  const admin = serviceClient();
  if (!admin) redirect("/admin/equipo?error=" + encodeURIComponent("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local"));

  // Temporary password shown once to the owner; the person changes it in "Mi cuenta".
  const tempPassword = randomBytes(9).toString("base64url");
  const { full_name, email, role } = parsed.data;
  const { error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name },
    app_metadata: { merovan_role: role },
  });
  if (error) redirect("/admin/equipo?error=" + encodeURIComponent(`No se pudo crear: ${error.message}`));
  await audit("alta_usuario", "profiles", email, { role });
  // Never put the password in the URL: short-lived httpOnly cookie, scoped to this page.
  (await cookies()).set(TEMP_COOKIE, JSON.stringify({ email, password: tempPassword }), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 120, path: "/admin/equipo",
  });
  revalidatePath("/admin/equipo");
  redirect("/admin/equipo");
}

async function changeRole(userId: string, formData: FormData) {
  "use server";
  const staff = await requireRole("owner");
  if (userId === staff.id) redirect("/admin/equipo?error=" + encodeURIComponent("No puedes cambiar tu propio rol"));
  const role = String(formData.get("role"));
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) redirect("/admin/equipo?error=" + encodeURIComponent(error.message));
  await audit("cambio_rol", "profiles", userId, { role });
  revalidatePath("/admin/equipo");
  redirect("/admin/equipo?ok=" + encodeURIComponent("Rol actualizado"));
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireRole("owner");
  const { ok, error } = await searchParams;
  const temp = (await cookies()).get(TEMP_COOKIE)?.value;
  const { email: creado, password: clave } = temp ? (JSON.parse(temp) as { email: string; password: string }) : {};
  const supabase = await createClient();
  const { data: team } = await supabase.from("profiles").select("*").order("created_at");

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Equipo</h1>
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      {creado && clave && (
        <Notice tone="ok">
          Cuenta creada para <strong>{creado}</strong>. Contraseña temporal: <code className="font-mono">{clave}</code> — pásasela por un canal privado;
          deja de mostrarse en 2 minutos. Al entrar debe cambiarla en «Mi cuenta».
        </Notice>
      )}

      <Card title="Personas">
        <Table head={["Nombre", "Rol", "Alta", ""]}>
          {(team ?? []).map((m) => (
            <tr key={m.id}>
              <td>{m.full_name || "—"}{m.id === staff.id && <span className="ml-1 text-xs text-muted">(tú)</span>}</td>
              <td colSpan={m.id === staff.id ? 3 : 1}>{m.id === staff.id ? m.role : (
                <form action={changeRole.bind(null, m.id)} className="flex gap-2">
                  <select name="role" defaultValue={m.role} className={`${input} mt-0 w-40`} aria-label={`Rol de ${m.full_name}`}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <button className={btnGhost}>Cambiar</button>
                </form>
              )}</td>
              {m.id !== staff.id && <><td>{date(m.created_at)}</td><td /></>}
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Dar de alta">
        {!serviceClient() && (
          <Notice tone="danger">
            Para crear cuentas falta la clave secreta de Supabase en <code>.env.local</code> (<code>SUPABASE_SERVICE_ROLE_KEY</code>).
          </Notice>
        )}
        <form action={createMember} className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="Nombre"><input name="full_name" required className={input} /></Field>
          <Field label="Correo"><input name="email" type="email" required className={input} /></Field>
          <Field label="Rol">
            <select name="role" className={input}>{ROLES.filter((r) => r !== "owner").map((r) => <option key={r}>{r}</option>)}</select>
          </Field>
          <button className={btn}>Crear cuenta</button>
        </form>
        <ul className="mt-4 grid gap-1 text-xs text-muted sm:grid-cols-2">
          {Object.entries(ROLE_HELP).map(([r, h]) => <li key={r}><strong className="text-foreground">{r}</strong>: {h}</li>)}
        </ul>
      </Card>
    </div>
  );
}
