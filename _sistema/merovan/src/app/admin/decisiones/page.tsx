import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DecisionBadge } from "@/components/decision-badge";
import { Badge, Card, Notice, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { audit, requireRole } from "@/lib/admin";
import { runDecisionEngine } from "@/lib/decisions";
import type { RuleCheck } from "@/lib/domain/decision";
import { date, eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Decisiones" };

const DECIDERS = ["owner", "producto"] as const;

async function recalculate() {
  "use server";
  await requireRole(...DECIDERS);
  const results = await runDecisionEngine(await createClient());
  await audit("motor_decision", "recommendations", null, { results });
  revalidatePath("/admin", "layout");
  redirect("/admin/decisiones?ok=" + encodeURIComponent(`${results.length} productos analizados`));
}

async function decideRec(id: string, formData: FormData) {
  "use server";
  const staff = await requireRole(...DECIDERS);
  const status = String(formData.get("status"));
  const note = String(formData.get("note") ?? "").trim();
  if (status === "rechazada" && note.length < 3) {
    redirect("/admin/decisiones?error=" + encodeURIComponent("Explica por qué rechazas la recomendación"));
  }
  const supabase = await createClient();
  const { error } = await supabase.from("recommendations")
    .update({ status, decided_by: staff.id, decided_at: new Date().toISOString(), decision_note: note || null })
    .eq("id", id);
  if (error) redirect("/admin/decisiones?error=" + encodeURIComponent(error.message));
  await audit(`recomendacion_${status}`, "recommendations", id, { note });
  revalidatePath("/admin", "layout");
  redirect("/admin/decisiones?ok=" + encodeURIComponent(`Recomendación ${status}`));
}

const CONF_TONE = { alta: "ok", media: "gold", baja: "danger" } as const;
const dec = (n: number | null) => (n == null ? "—" : n.toFixed(2).replace(".", ","));

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "producto", "marketing", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [{ data: open }, { data: history }, { data: team }] = await Promise.all([
    supabase.from("recommendations").select("*, products(code, name, status)").in("status", ["pendiente", "aceptada"])
      .order("created_at", { ascending: false }),
    supabase.from("recommendations").select("*, products(code, name)").in("status", ["rechazada", "ejecutada"])
      .order("decided_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const canDecide = staff.role === "owner" || staff.role === "producto";
  const who = (id: string | null) => team?.find((t) => t.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Decisiones</h1>
          <p className="text-sm text-muted">Escalar · arreglar · matar · esperar, con las reglas y los números que lo justifican.</p>
        </div>
        {canDecide && <form action={recalculate}><button className={btn}>Recalcular ahora</button></form>}
      </header>
      <Toast ok={ok} error={error} />

      {(open ?? []).length === 0 && (
        <Notice>No hay recomendaciones abiertas. Pulsa «Recalcular» cuando haya productos en test con métricas importadas.</Notice>
      )}

      {(open ?? []).map((r) => {
        const m = r.metrics as { spendCents: number; revenueCents: number; purchases: number; roas: number | null; cpaCents: number | null; ctr: number | null; breakEvenRoas: number | null; targetRoas: number | null; testCapCents: number | null };
        return (
          <Card key={r.id} title={`${r.products?.code} · ${r.products?.name}`} actions={
            <span className="flex items-center gap-2">
              <DecisionBadge decision={r.decision} />
              <Badge tone={CONF_TONE[r.confidence as keyof typeof CONF_TONE]}>confianza {r.confidence}</Badge>
              {r.status === "aceptada" && <Badge tone="ok">aceptada</Badge>}
            </span>
          }>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-semibold">Por qué</p>
                  <ul className="list-disc pl-5">{r.reasons.map((x: string) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div>
                  <p className="font-semibold">Qué hacer</p>
                  <ul className="list-disc pl-5">{r.actions.map((x: string) => <li key={x}>{x}</li>)}</ul>
                </div>
                <dl className="grid grid-cols-3 gap-2 rounded-md border border-border p-2 text-xs">
                  <div><dt className="text-muted">Gasto</dt><dd className="tabular-nums">{eur(m.spendCents)}</dd></div>
                  <div><dt className="text-muted">Ingresos s/IVA</dt><dd className="tabular-nums">{eur(m.revenueCents)}</dd></div>
                  <div><dt className="text-muted">Pedidos</dt><dd className="tabular-nums">{m.purchases}</dd></div>
                  <div><dt className="text-muted">ROAS / equilibrio</dt><dd className="tabular-nums">{dec(m.roas)} / {dec(m.breakEvenRoas)}</dd></div>
                  <div><dt className="text-muted">CPA</dt><dd className="tabular-nums">{m.cpaCents != null ? eur(Math.round(m.cpaCents)) : "—"}</dd></div>
                  <div><dt className="text-muted">Tope de test</dt><dd className="tabular-nums">{m.testCapCents != null ? eur(m.testCapCents) : "—"}</dd></div>
                </dl>
                <p className="text-xs text-muted">Periodo {date(r.period_from)} – {date(r.period_to)} · calculada {date(r.created_at)}</p>
              </div>
              <Table head={["Regla", "Valor", "Umbral", ""]}>
                {(r.checks as RuleCheck[]).map((c) => (
                  <tr key={c.id} className={c.hit ? "" : "text-muted"}>
                    <td>{c.label}</td><td className="tabular-nums">{c.value}</td><td className="tabular-nums">{c.threshold}</td>
                    <td>{c.hit ? "●" : "○"}</td>
                  </tr>
                ))}
              </Table>
            </div>
            {r.confidence === "baja" && <p className="mt-3 text-sm text-danger">Pocos datos: tómala como orientación, no como conclusión.</p>}
            {canDecide && (
              <form action={decideRec.bind(null, r.id)} className="mt-4 flex flex-wrap gap-2">
                <input name="note" placeholder="Motivo / comentario" className={`${input} mt-0 w-72`} aria-label="Motivo de la decisión" />
                {r.status === "pendiente" ? (
                  <>
                    <button name="status" value="aceptada" className={btn}>Aceptar</button>
                    <button name="status" value="rechazada" className={btnGhost}>Rechazar</button>
                  </>
                ) : <button name="status" value="ejecutada" className={btn}>Marcar como ejecutada</button>}
                {r.decision === "matar" && (
                  <Link href={`/admin/productos/${r.products?.code}#estado`} className={btnGhost}>Ir al producto para descartarlo</Link>
                )}
              </form>
            )}
          </Card>
        );
      })}

      <Card title="Historial de decisiones">
        <Table head={["Fecha", "Producto", "Recomendación", "Resultado", "Quién", "Motivo"]}>
          {(history ?? []).map((r) => (
            <tr key={r.id}>
              <td>{date(r.decided_at)}</td>
              <td><Link href={`/admin/productos/${r.products?.code}`} className="hover:text-gold">{r.products?.code} · {r.products?.name}</Link></td>
              <td><DecisionBadge decision={r.decision} /></td>
              <td>{r.status}</td>
              <td>{who(r.decided_by)}</td>
              <td>{r.decision_note ?? ""}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-muted">Los umbrales se editan en Ajustes (<code>decision_rules</code>, <code>decision_window_days</code>).</p>
      </Card>
    </div>
  );
}
