import Link from "next/link";
import { Badge, Card, Field, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { AGENTS } from "@/lib/agents/agents";
import { hasApiKey } from "@/lib/agents/model";
import { date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createTestProposals, deleteDemoResearch, runAgentNow, toggleDryRun, toggleKillSwitch } from "./actions";

const usd = (micro: number) => `${(micro / 1_000_000).toFixed(2).replace(".", ",")} $`;

export default async function AgentsHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "producto", "marketing", "operaciones", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  const [{ data: state }, { data: costs }, { data: budget }, { data: events }, { data: tasks }] = await Promise.all([
    supabase.from("system_state").select("*").single(),
    supabase.from("agent_costs").select("*").eq("month", month),
    supabase.from("guardrails").select("value").eq("key", "ai_monthly_budget").single(),
    supabase.from("kill_switch_events").select("*").order("created_at", { ascending: false }).limit(8),
    supabase.from("agent_tasks").select("agent, title, status, created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const spent = (costs ?? []).reduce((s, c) => s + Number(c.cost_microusd), 0);
  const budgetMicro = Number(budget?.value ?? 0) * 10_000;
  const pct = budgetMicro ? Math.min(100, (spent / budgetMicro) * 100) : 0;
  const canStop = staff.role === "owner" || staff.role === "operaciones";

  return (
    <>
      <Toast ok={ok} error={error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Parada global">
          <p className="text-sm text-muted">Pausa todas las ejecuciones externas: publicaciones, gasto, mensajes y pedidos. Los agentes pueden seguir analizando.</p>
          {state?.kill_switch && <p className="mt-2 rounded-xl bg-[#fef3f2] px-3 py-2 text-sm text-danger">Motivo: {state.kill_reason}</p>}
          {canStop && (
            <form action={toggleKillSwitch} className="mt-3 space-y-2">
              <input type="hidden" name="on" value={state?.kill_switch ? "0" : "1"} />
              <input name="reason" placeholder="Motivo" className={input} aria-label="Motivo" />
              <button className={state?.kill_switch ? btn : "inline-flex w-full items-center justify-center rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"}>
                {state?.kill_switch ? "Reanudar" : "PARAR TODO"}
              </button>
            </form>
          )}
        </Card>

        <Card title="Modo simulación">
          <p className="text-sm text-muted">En simulación los agentes hacen todo el trabajo pero ninguna acción externa ocurre de verdad. Desactívalo solo cuando hayas configurado límites e integraciones.</p>
          {staff.role === "owner" && (
            <form action={toggleDryRun} className="mt-3 space-y-2">
              <input type="hidden" name="dry_run" value={state?.dry_run ? "0" : "1"} />
              {state?.dry_run && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="confirm" /> Entiendo que las acciones aprobadas serán reales</label>}
              <button className={btnGhost}>{state?.dry_run ? "Desactivar simulación" : "Volver a simulación"}</button>
            </form>
          )}
        </Card>

        <Card title="Coste de IA este mes">
          <p className="text-3xl font-semibold tabular-nums">{usd(spent)}</p>
          <p className="text-xs text-muted">de {usd(budgetMicro)} de presupuesto ({pct.toFixed(0)} %)</p>
          <div className="mt-3 h-2.5 rounded-full bg-background">
            <div className={`h-full rounded-full ${pct >= 80 ? "bg-danger" : "bg-gold"}`} style={{ width: `${pct}%` }} />
          </div>
          {pct >= 80 && <p className="mt-2 text-xs text-danger">Aviso: más del 80 % del presupuesto usado.</p>}
          <p className="mt-3 text-xs text-muted">IA: {hasApiKey() ? "conectada (Claude)" : "sin clave: modo de prueba"}</p>
        </Card>
      </div>

      <Card title="Agentes">
        <Table head={["Agente", "Modelo", "Estado", "Ejecuciones (mes)", "Coste (mes)"]}>
          {AGENTS.map((a) => {
            const c = costs?.find((x) => x.agent === a.key);
            return (
              <tr key={a.key}>
                <td className="font-medium">{a.name}</td>
                <td className="font-mono text-xs">{a.model} · {a.effort}</td>
                <td>{a.ready ? <Badge tone="ok">disponible</Badge> : <Badge>próxima fase</Badge>}</td>
                <td className="tabular-nums">{c?.runs ?? 0}</td>
                <td className="tabular-nums">{usd(Number(c?.cost_microusd ?? 0))}</td>
              </tr>
            );
          })}
        </Table>
        {(staff.role === "owner" || staff.role === "producto") && (
          <form action={runAgentNow} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
            <Field label="Agente">
              <select name="agent" className={input}>{AGENTS.filter((a) => a.ready).map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select>
            </Field>
            <Field label="Instrucción"><input name="instructions" placeholder="Planifica el día / Revisa las propuestas pendientes" className={input} /></Field>
            <button className={btn}>Ejecutar ahora</button>
          </form>
        )}
        {staff.role === "owner" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {process.env.NODE_ENV !== "production" && <form action={createTestProposals}><button className={btnGhost}>Crear propuestas de prueba (solo desarrollo)</button></form>}
            <form action={deleteDemoResearch}><button className={btnGhost}>Borrar datos de ejemplo de los agentes</button></form>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tareas encargadas" actions={<Link href="/admin/agentes/actividad" className="text-xs underline-offset-4 hover:underline">Ver actividad</Link>}>
          <Table head={["Fecha", "Para", "Tarea", "Estado"]}>
            {(tasks ?? []).map((t, i) => <tr key={i}><td>{date(t.created_at)}</td><td>{t.agent}</td><td>{t.title}</td><td><Badge>{t.status}</Badge></td></tr>)}
          </Table>
        </Card>
        <Card title="Paradas y reanudaciones">
          <Table head={["Fecha", "Acción", "Motivo", "Origen"]}>
            {(events ?? []).map((e) => (
              <tr key={e.id}><td>{new Date(e.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</td><td>{e.action}</td><td>{e.reason}</td><td>{e.automatic ? "automática" : "manual"}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
