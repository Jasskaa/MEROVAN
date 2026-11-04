// Proposal pipeline: agent proposes → compliance (veto) → autonomy decision → (execute | simulate |
// wait for approval | draft | block). Approval and execution go through the same checks again.
import { deterministicReview, publishableText } from "./compliance";
import { type ActionPayload, actionType, evaluateAction } from "./policy";
import type { AgentStore, ProposalRow } from "./store";

export interface ProposeInput {
  agent: string;
  runId: string | null;
  taskId: string | null;
  actionType: string;
  title: string;
  payload: ActionPayload & Record<string, unknown>;
  reason: string;
  metrics?: Record<string, unknown>;
  idempotencyKey?: string;
}

const STATUS_BY_DECISION = { ejecutar: "aprobada", simular: "aprobada", aprobacion: "pendiente", borrador: "pendiente", bloquear: "bloqueada" } as const;

/** Executors per action type. Phase 1: only internal drafts are real; the rest are adapters not yet connected. */
async function execute(store: AgentStore, p: ProposalRow, dryRun: boolean) {
  const t = actionType(p.action_type);
  if (t?.external && dryRun) return { simulado: true, detalle: `Simulación: se habría ejecutado «${p.title}»` };
  if (p.action_type === "crear_borrador_producto") {
    const code = await store.createProductDraft({
      name: String(p.payload.name ?? p.title), description: String(p.payload.description ?? ""),
      price_cents: typeof p.payload.price_cents === "number" ? p.payload.price_cents : undefined,
    });
    return { creado: code };
  }
  throw new Error(`Integración no conectada para «${t?.label ?? p.action_type}»: hazlo a mano y márcalo, o conecta la integración`);
}

async function runExecution(store: AgentStore, id: string) {
  const p = await store.getProposal(id);
  if (!p) throw new Error("Propuesta no encontrada");
  const state = await store.getState();
  if (state.killSwitch && actionType(p.action_type)?.external) throw new Error("Parada global activa: no se ejecuta ninguna acción");
  try {
    const result = await execute(store, p, state.dryRun);
    const simulated = (result as { simulado?: boolean }).simulado === true;
    await store.updateProposal(id, { status: simulated ? "simulada" : "ejecutada", result, executed_at: new Date().toISOString() });
    return simulated ? "simulada" : "ejecutada";
  } catch (e) {
    await store.updateProposal(id, { status: "fallida", result: { error: (e as Error).message } });
    await store.logAction({ runId: p.run_id, agent: p.agent, tool: `ejecutar:${p.action_type}`, input: p.payload, outcome: "error", output: (e as Error).message });
    return "fallida";
  }
}

export async function propose(store: AgentStore, i: ProposeInput) {
  const t = actionType(i.actionType);
  const issues = t?.external || i.actionType === "crear_borrador_producto"
    ? deterministicReview({
        text: publishableText(i.payload),
        containsAi: Boolean(i.payload.contains_ai), aiLabelled: Boolean(i.payload.ai_labelled),
        claimsVerified: Boolean(i.payload.claims_verified),
        listingErrors: Array.isArray(i.payload.listing_errors) ? (i.payload.listing_errors as string[]) : [],
      })
    : [];
  const compliance = { veredicto: issues.length ? ("vetado" as const) : ("aprobado" as const), motivos: issues, revisor: "reglas" };

  const [state, guardrails, level, usage] = await Promise.all([
    store.getState(), store.getGuardrails(), store.getLevel(i.agent, i.actionType), store.getUsage(),
  ]);
  const ev = evaluateAction({ actionType: i.actionType, level, payload: i.payload, guardrails, state, usage });
  const vetoed = compliance.veredicto === "vetado";

  const { id, duplicate } = await store.createProposal({
    run_id: i.runId, task_id: i.taskId, agent: i.agent, action_type: i.actionType, title: i.title,
    payload: i.payload, reason: i.reason, metrics: i.metrics ?? {}, level, decision: ev.decision,
    decision_reasons: ev.reasons, compliance, idempotency_key: i.idempotencyKey ?? null,
    status: vetoed ? "vetada" : STATUS_BY_DECISION[ev.decision],
  });
  if (duplicate) return { id, status: "duplicada", decision: ev.decision, reasons: ["Ya existe una propuesta idéntica"], compliance };

  let status: string = vetoed ? "vetada" : STATUS_BY_DECISION[ev.decision];
  if (!vetoed && (ev.decision === "ejecutar" || ev.decision === "simular")) status = await runExecution(store, id);
  await store.logAction({ runId: i.runId, agent: i.agent, tool: "proponer_accion", input: { actionType: i.actionType, title: i.title }, outcome: status === "bloqueada" || vetoed ? "bloqueada" : "propuesta", output: { id, status, reasons: ev.reasons, compliance } });
  return { id, status, decision: ev.decision, reasons: ev.reasons, compliance };
}

/** Human decision from the panel. Approving re-checks kill switch, limits and veto before running. */
export async function decide(store: AgentStore, id: string, approve: boolean, by: { role: string }) {
  const p = await store.getProposal(id);
  if (!p) throw new Error("Propuesta no encontrada");
  if (p.status !== "pendiente") throw new Error(`La propuesta ya está «${p.status}»`);
  const t = actionType(p.action_type);
  if (approve && t?.alwaysHuman && by.role !== "owner") throw new Error("Esta acción solo la puede aprobar el owner");
  if (approve && p.compliance?.veredicto === "vetado") throw new Error("Vetada por Cumplimiento: corrige y vuelve a proponer");

  await store.bumpPolicy(p.agent, p.action_type, approve ? "aprobada" : "rechazada");
  if (!approve) { await store.updateProposal(id, { status: "rechazada" }); return "rechazada"; }
  if (p.decision === "borrador") { await store.updateProposal(id, { status: "aprobada" }); return "aprobada"; } // N1: accepted draft, nothing external runs

  // Limits may have changed since it was proposed: check again with current usage.
  const [state, guardrails, usage] = await Promise.all([store.getState(), store.getGuardrails(), store.getUsage()]);
  const ev = evaluateAction({ actionType: p.action_type, level: 2, payload: p.payload as ActionPayload, guardrails, state, usage });
  if (ev.decision === "bloquear") { await store.updateProposal(id, { status: "bloqueada", decision_reasons: ev.reasons }); return "bloqueada"; }
  await store.updateProposal(id, { status: "aprobada" });
  return runExecution(store, id);
}

/** Automatic stop: repeated tool errors or a refund spike pause every external action. */
export async function autoKillCheck(store: AgentStore) {
  const [g, state] = await Promise.all([store.getGuardrails(), store.getState()]);
  if (state.killSwitch) return null;
  const errors = (await store.recentToolErrors(3600_000)).find((e) => e.count >= (g.auto_kill_errors_hour ?? 3));
  if (errors) { const r = `Parada automática: ${errors.count} errores de «${errors.tool}» en 1 h`; await store.setKillSwitch(true, r, true); return r; }
  const refunds = await store.refundsLast24h();
  if (refunds >= (g.auto_kill_refunds_24h ?? 5)) { const r = `Parada automática: ${refunds} reembolsos en 24 h`; await store.setKillSwitch(true, r, true); return r; }
  return null;
}
