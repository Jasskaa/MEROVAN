import { Badge, Card, Table, Toast } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { agentByKey } from "@/lib/agents/agents";
import { createClient } from "@/lib/supabase/server";

const when = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });
const usd = (micro: number) => `${(micro / 1_000_000).toFixed(4).replace(".", ",")} $`;
const TONE = { ok: "ok", error: "danger", propuesta: "gold", bloqueada: "danger" } as const;

export default async function Activity({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; agente?: string }> }) {
  await requireRole("owner", "producto", "marketing", "operaciones", "finanzas");
  const { ok, error, agente } = await searchParams;
  const supabase = await createClient();
  let runsQ = supabase.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(30);
  let actsQ = supabase.from("agent_actions").select("*").order("created_at", { ascending: false }).limit(80);
  if (agente) { runsQ = runsQ.eq("agent", agente); actsQ = actsQ.eq("agent", agente); }
  const [{ data: runs }, { data: actions }] = await Promise.all([runsQ, actsQ]);

  return (
    <>
      <Toast ok={ok} error={error} />
      <Card title="Ejecuciones">
        <Table head={["Inicio", "Agente", "Modelo", "Estado", "Pasos", "Tokens (ent./sal.)", "Coste", "Resumen"]}>
          {(runs ?? []).map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{when(r.started_at)}</td>
              <td><a href={`?agente=${r.agent}`} className="hover:text-gold">{agentByKey(r.agent)?.name ?? r.agent}</a></td>
              <td className="font-mono text-xs">{r.model}{r.dry_run ? " · sim." : ""}</td>
              <td><Badge tone={r.status === "ok" ? "ok" : r.status === "en_curso" ? "gold" : "danger"}>{r.status}</Badge></td>
              <td className="tabular-nums">{r.steps}</td>
              <td className="tabular-nums text-xs">{r.input_tokens} / {r.output_tokens}</td>
              <td className="tabular-nums text-xs">{usd(Number(r.cost_microusd))}</td>
              <td className="max-w-md text-xs"><details><summary className="cursor-pointer truncate">{(r.summary ?? r.error ?? "").slice(0, 90)}</summary><p className="mt-1 whitespace-pre-line">{r.summary ?? r.error}</p></details></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Acciones (cada llamada a herramienta)">
        <ol className="space-y-2">
          {(actions ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <span className="w-28 shrink-0 text-xs text-muted">{when(a.created_at)}</span>
              <span className="w-36 shrink-0">{agentByKey(a.agent)?.name ?? a.agent}</span>
              <span className="font-mono text-xs">{a.tool}</span>
              <Badge tone={TONE[a.outcome as keyof typeof TONE] ?? "neutral"}>{a.outcome}</Badge>
              <details className="min-w-0 flex-1 text-xs">
                <summary className="cursor-pointer text-muted">detalle</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-background p-2">{JSON.stringify({ entrada: a.input, salida: a.output }, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
