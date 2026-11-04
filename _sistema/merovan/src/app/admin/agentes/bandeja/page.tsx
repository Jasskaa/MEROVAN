import { Badge, Card, Notice, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { agentByKey } from "@/lib/agents/agents";
import { actionType } from "@/lib/agents/policy";
import { date, eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { decideProposals } from "../actions";

const TONE: Record<string, "ok" | "danger" | "gold" | "neutral"> = { ejecutar: "ok", simular: "gold", aprobacion: "gold", borrador: "neutral", bloquear: "danger" };
const LABEL: Record<string, string> = { aprobacion: "se ejecuta al aprobar", borrador: "borrador (N1)", bloquear: "bloqueada", simular: "simulación", ejecutar: "ejecutada" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; ver?: string }> }) {
  const staff = await requireRole("owner", "producto", "marketing", "operaciones", "finanzas");
  const { ok, error, ver } = await searchParams;
  const supabase = await createClient();
  const status = ver === "historial" ? undefined : "pendiente";
  let q = supabase.from("agent_proposals").select("*").order("created_at", { ascending: false }).limit(100);
  q = status ? q.eq("status", status) : q.neq("status", "pendiente");
  const { data: proposals } = await q;
  const canDecide = staff.role === "owner" || staff.role === "producto";

  return (
    <>
      <Toast ok={ok} error={error} />
      <nav className="flex gap-2 text-sm">
        <a href="?" className={`rounded-lg px-3 py-1.5 ${!ver ? "bg-[#0e0e0d] text-white" : "border border-border"}`}>Pendientes</a>
        <a href="?ver=historial" className={`rounded-lg px-3 py-1.5 ${ver ? "bg-[#0e0e0d] text-white" : "border border-border"}`}>Historial</a>
      </nav>
      {(proposals ?? []).length === 0 ? <Notice>No hay propuestas {status ? "pendientes" : "en el historial"}.</Notice> : (
        <form action={decideProposals} className="space-y-3">
          {(proposals ?? []).map((p) => {
            const t = actionType(p.action_type);
            const amount = Number(p.payload?.amount_cents ?? 0);
            return (
              <Card key={p.id} title={p.title} actions={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[p.decision]}>{LABEL[p.decision] ?? p.decision}</Badge>
                  {p.compliance && <Badge tone={p.compliance.veredicto === "vetado" ? "danger" : "ok"}>Cumplimiento: {p.compliance.veredicto}</Badge>}
                  {!status && <Badge>{p.status}</Badge>}
                </span>
              }>
                <div className="grid gap-4 lg:grid-cols-[auto_1fr_1fr]">
                  {canDecide && status && <input type="checkbox" name="ids" value={p.id} className="mt-1 h-4 w-4" aria-label={`Seleccionar ${p.title}`} />}
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted">Agente:</span> {agentByKey(p.agent)?.name ?? p.agent} · <span className="text-muted">Acción:</span> {t?.label ?? p.action_type} · N{p.level}</p>
                    {amount > 0 && <p><span className="text-muted">Importe:</span> <strong>{eur(amount)}</strong></p>}
                    <p><span className="text-muted">Por qué:</span> {p.reason}</p>
                    <ul className="text-xs text-muted">{(p.decision_reasons ?? []).map((r: string) => <li key={r}>· {r}</li>)}</ul>
                    {p.compliance?.motivos?.length > 0 && <ul className="text-xs text-danger">{p.compliance.motivos.map((m: string) => <li key={m}>✕ {m}</li>)}</ul>}
                    <p className="text-xs text-muted">{date(p.created_at)}{p.decision_note ? ` · Nota: ${p.decision_note}` : ""}</p>
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted">Vista previa de lo que se publicará / gastará / enviará</summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-background p-3">{JSON.stringify(p.payload, null, 2)}</pre>
                    {p.result && <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-background p-3">{JSON.stringify(p.result, null, 2)}</pre>}
                  </details>
                </div>
              </Card>
            );
          })}
          {canDecide && status && (
            <div className="sticky bottom-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 shadow-lg">
              <input name="note" placeholder="Nota (obligatoria para rechazar)" className={`${input} mt-0 flex-1`} aria-label="Nota" />
              <button name="decision" value="aprobar" className={btn}>Aprobar seleccionadas</button>
              <button name="decision" value="rechazar" className={btnGhost}>Rechazar seleccionadas</button>
            </div>
          )}
        </form>
      )}
    </>
  );
}
