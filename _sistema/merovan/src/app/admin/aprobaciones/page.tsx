import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, Card, Notice, Table, btn, btnGhost, input } from "@/components/ui";
import { audit, requireRole } from "@/lib/admin";
import { date, eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Aprobaciones" };

const ACTION_LABEL: Record<string, string> = {
  publish_product: "Publicar producto",
  change_price: "Cambiar precio",
};

const fail = (msg: string): never => redirect("/admin/aprobaciones?error=" + encodeURIComponent(msg));

/** Owner decision. Approving executes the action; the database guards still apply. */
async function decide(approvalId: string, formData: FormData) {
  "use server";
  const staff = await requireRole("owner");
  const approve = formData.get("decision") === "aprobar";
  const note = String(formData.get("note") ?? "").trim() || null;
  const supabase = await createClient();
  const { data: a } = await supabase.from("approvals").select("*").eq("id", approvalId).eq("status", "pendiente").single();
  if (!a) fail("La solicitud ya no está pendiente");

  if (approve) {
    const update =
      a.action === "publish_product" ? { publish_status: "publicado" }
      : a.action === "change_price" ? { price_cents: a.payload.to }
      : null;
    if (!update) fail(`Acción desconocida: ${a.action}`);
    const { error } = await supabase.from("products").update(update!).eq("code", a.entity_id);
    if (error) fail(`No se pudo ejecutar: ${error.message}`);
  } else if (a.action === "publish_product") {
    await supabase.from("products").update({ publish_status: "borrador" }).eq("code", a.entity_id);
  }

  await supabase.from("approvals").update({
    status: approve ? "ejecutada" : "rechazada", decided_by: staff.id, decided_at: new Date().toISOString(), decision_note: note,
  }).eq("id", approvalId);
  await audit(approve ? "aprobar" : "rechazar", "approvals", approvalId, { action: a.action, entity: a.entity_id, note });
  revalidatePath("/admin/aprobaciones");
  redirect("/admin/aprobaciones?ok=" + encodeURIComponent(approve ? "Aprobado y ejecutado" : "Rechazado"));
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole();
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [pending, done, team] = await Promise.all([
    supabase.from("approvals").select("*").eq("status", "pendiente").order("requested_at"),
    supabase.from("approvals").select("*").neq("status", "pendiente").order("decided_at", { ascending: false }).limit(20),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const who = (id: string | null) => team.data?.find((t) => t.id === id)?.full_name ?? "—";
  const isOwner = staff.role === "owner";
  const detail = (a: { action: string; payload: { from?: number; to?: number } }) =>
    a.action === "change_price" ? `${a.payload.from != null ? eur(a.payload.from) : "—"} → ${a.payload.to != null ? eur(a.payload.to) : "—"}` : "";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Aprobaciones</h1>
        <p className="text-sm text-muted">Nada que cueste dinero, publique o cambie un precio público se ejecuta sin la aprobación del owner.</p>
      </header>
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <Card title={`Pendientes (${pending.data?.length ?? 0})`}>
        {(pending.data ?? []).length === 0 ? <p className="text-sm text-muted">No hay nada pendiente.</p> : (
          <ul className="space-y-3">
            {pending.data!.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                <p>
                  <strong>{ACTION_LABEL[a.action] ?? a.action}</strong> ·{" "}
                  <Link href={`/admin/productos/${a.entity_id}`} className="font-mono hover:text-gold">{a.entity_id}</Link> {detail(a)}
                </p>
                <p className="text-xs text-muted">{a.reason} · pedido por {who(a.requested_by)} el {date(a.requested_at)}</p>
                {isOwner && (
                  <form action={decide.bind(null, a.id)} className="mt-2 flex flex-wrap gap-2">
                    <input name="note" placeholder="Nota (opcional)" className={`${input} mt-0 w-64`} aria-label="Nota de la decisión" />
                    <button name="decision" value="aprobar" className={btn}>Aprobar</button>
                    <button name="decision" value="rechazar" className={btnGhost}>Rechazar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Historial">
        <Table head={["Fecha", "Acción", "Producto", "Resultado", "Decidió", "Nota"]}>
          {(done.data ?? []).map((a) => (
            <tr key={a.id}>
              <td>{date(a.decided_at)}</td>
              <td>{ACTION_LABEL[a.action] ?? a.action} {detail(a)}</td>
              <td className="font-mono text-xs">{a.entity_id}</td>
              <td><Badge tone={a.status === "rechazada" ? "danger" : "ok"}>{a.status}</Badge></td>
              <td>{who(a.decided_by)}</td>
              <td>{a.decision_note ?? ""}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
