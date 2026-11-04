import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Badge, Card, Field, Notice, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { audit, requireRole, serviceClient } from "@/lib/admin";
import { dailyRoutine, runJob } from "@/lib/jobs";
import { checkVault } from "@/lib/obsidian/check";
import { exportToVault, vaultRoot } from "@/lib/obsidian/export";
import { stripe } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sistema" };
export const dynamic = "force-dynamic";

async function exportNow() {
  "use server";
  await requireRole("owner", "producto");
  const supabase = await createClient();
  const r = await runJob(supabase, "exportar_obsidian", "manual", async () => {
    const x = await exportToVault(supabase);
    return { creadas: x.created, actualizadas: x.updated, movidas: x.moved, sin_cambios: x.unchanged, errores_boveda: x.vaultErrors };
  });
  revalidatePath("/admin/sistema");
  if (!r.ok) redirect("/admin/sistema?error=" + encodeURIComponent(r.error));
  const d = r.details as { creadas: string[]; actualizadas: string[]; movidas: string[]; sin_cambios: number; errores_boveda: number };
  redirect("/admin/sistema?ok=" + encodeURIComponent(
    `Exportado: ${d.creadas.length} creadas, ${d.actualizadas.length} actualizadas, ${d.movidas.length} movidas, ${d.sin_cambios} sin cambios · bóveda con ${d.errores_boveda} errores`));
}

async function runDailyNow() {
  "use server";
  await requireRole("owner");
  await dailyRoutine(await createClient(), "manual", serviceClient());
  revalidatePath("/admin", "layout");
  redirect("/admin/sistema?ok=" + encodeURIComponent("Tareas diarias ejecutadas (ver registro)"));
}

async function gdpr(formData: FormData) {
  "use server";
  await requireRole("owner");
  const email = String(formData.get("email") ?? "").trim();
  const action = String(formData.get("action"));
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) redirect("/admin/sistema?error=" + encodeURIComponent("Correo no válido"));
  const supabase = await createClient();
  if (action === "anonimizar") {
    if (formData.get("confirm") !== "on") redirect("/admin/sistema?error=" + encodeURIComponent("Marca la casilla de confirmación"));
    const { data, error } = await supabase.rpc("anonymize_customer", { p_email: email });
    if (error) redirect("/admin/sistema?error=" + encodeURIComponent(error.message));
    redirect("/admin/sistema?ok=" + encodeURIComponent(`Datos anonimizados en ${data} pedido(s). Se conservan importes e IVA por obligación contable.`));
  }
  await audit("rgpd_acceso", "orders", null, {});
  const { data } = await supabase.rpc("customer_data", { p_email: email });
  // Personal data never goes in the URL: short-lived httpOnly cookie scoped to this page.
  (await cookies()).set(GDPR_COOKIE, JSON.stringify(data), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 120, path: "/admin/sistema",
  });
  redirect("/admin/sistema");
}

const GDPR_COOKIE = "merovan_rgpd";

export default async function SystemPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "producto", "finanzas", "operaciones");
  const { ok, error } = await searchParams;
  const rgpd = staff.role === "owner" ? (await cookies()).get(GDPR_COOKIE)?.value : undefined;
  const supabase = await createClient();
  const [{ data: runs }, { error: dbError }] = await Promise.all([
    supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(30),
    supabase.from("settings").select("key", { head: true, count: "exact" }),
  ]);
  const root = vaultRoot();
  const vault = root ? checkVault(root) : null;
  const lastExport = runs?.find((r) => r.job === "exportar_obsidian" && r.status === "ok");

  const health = [
    { name: "Base de datos (Supabase)", ok: !dbError, note: dbError?.message ?? "conectada" },
    { name: "Clave de servicio (altas de equipo, webhook, tareas)", ok: Boolean(serviceClient()), note: serviceClient() ? "configurada" : "falta SUPABASE_SERVICE_ROLE_KEY" },
    { name: "Pagos (Stripe)", ok: Boolean(stripe()), note: stripe() ? (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "modo REAL" : "modo prueba") : "sin configurar" },
    { name: "Webhook de Stripe", ok: Boolean(process.env.STRIPE_WEBHOOK_SECRET), note: process.env.STRIPE_WEBHOOK_SECRET ? "configurado" : "falta STRIPE_WEBHOOK_SECRET" },
    { name: "Tarea diaria (cron)", ok: Boolean(process.env.CRON_SECRET), note: process.env.CRON_SECRET ? "protegida con CRON_SECRET" : "falta CRON_SECRET" },
    { name: "Bóveda de Obsidian", ok: Boolean(root), note: root ? `${vault!.notes} notas · ${vault!.errors.length} errores · ${vault!.warnings.length} avisos` : "no accesible desde este servidor" },
    { name: "TikTok Shop / TikTok Ads / Meta Ads", ok: false, note: "modo manual (CSV); sin conexión por API todavía" },
  ];
  const canExport = staff.role === "owner" || staff.role === "producto";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Sistema</h1>
        <p className="text-sm text-muted">Salud de las integraciones, tareas automáticas, bóveda de Obsidian y privacidad.</p>
      </header>
      <Toast ok={ok} error={error} />

      <Card title="Integraciones">
        <ul className="space-y-1 text-sm">
          {health.map((h) => (
            <li key={h.name} className="flex flex-wrap justify-between gap-2 border-b border-border py-1 last:border-0">
              <span>{h.ok ? "🟢" : "⚪"} {h.name}</span><span className="text-muted">{h.note}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Obsidian">
          <p className="text-sm">Última exportación: {lastExport ? new Date(lastExport.finished_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "nunca"}</p>
          <p className="mt-1 text-xs text-muted">
            Actualiza notas de producto, el informe semanal y el historial de decisiones. Solo se reescribe lo que está entre los marcadores
            <code> merovan:auto</code>; el texto escrito a mano no se toca.
          </p>
          {canExport && <form action={exportNow} className="mt-3"><button className={btn} disabled={!root}>Exportar a Obsidian</button></form>}
          {vault && (vault.errors.length > 0 || vault.warnings.length > 0) && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer">{vault.errors.length} errores · {vault.warnings.length} avisos en la bóveda</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {vault.errors.map((e) => <li key={e} className="text-danger">✕ {e}</li>)}
                {vault.warnings.map((w) => <li key={w} className="text-muted">· {w}</li>)}
              </ul>
            </details>
          )}
        </Card>

        <Card title="Tareas automáticas">
          <p className="text-sm">Cada día a las 07:00 (hora de Madrid): motor de decisión y retención de datos. Los lunes, además, informe semanal en Obsidian.</p>
          {staff.role === "owner" && <form action={runDailyNow} className="mt-3"><button className={btnGhost}>Ejecutar ahora</button></form>}
        </Card>
      </div>

      <Card title="Registro de ejecuciones">
        <Table head={["Inicio", "Tarea", "Origen", "Intento", "Estado", "Detalle"]}>
          {(runs ?? []).map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.started_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</td>
              <td>{r.job}</td><td>{r.trigger}</td><td>{r.attempt}</td>
              <td><Badge tone={r.status === "ok" ? "ok" : r.status === "error" ? "danger" : "gold"}>{r.status}</Badge></td>
              <td className="max-w-96 truncate text-xs text-muted" title={r.error ?? JSON.stringify(r.details)}>{r.error ?? JSON.stringify(r.details)}</td>
            </tr>
          ))}
        </Table>
      </Card>

      {staff.role === "owner" && (
        <Card title="Privacidad (RGPD)">
          <form action={gdpr} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field label="Correo del cliente"><input name="email" type="email" required className={input} /></Field>
            <button name="action" value="consultar" className={btnGhost}>Ver sus datos</button>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="confirm" /> confirmo</label>
              <button name="action" value="anonimizar" className={btn}>Anonimizar</button>
            </div>
          </form>
          {rgpd && <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-border p-2 text-xs">{JSON.stringify(JSON.parse(rgpd), null, 2)}</pre>}
          <Notice>
            Anonimizar borra nombre, correo y seguimiento, pero conserva importes, IVA y país (obligación contable). Retención automática según Ajustes
            (<code>retention_customer_days</code>, <code>retention_page_views_days</code>).
          </Notice>
        </Card>
      )}
    </div>
  );
}
