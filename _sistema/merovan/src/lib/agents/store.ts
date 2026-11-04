// Data port for the agent system. The runtime and tools only talk to this interface, so the
// same code runs against Supabase (production) and an in-memory store (tests and evaluations).
import type { Guardrails, Usage } from "./policy";

export interface ProposalRow {
  id: string;
  run_id: string | null;
  task_id: string | null;
  agent: string;
  action_type: string;
  title: string;
  payload: Record<string, unknown>;
  reason: string;
  metrics: Record<string, unknown>;
  level: number;
  decision: string;
  decision_reasons: string[];
  compliance: { veredicto: "aprobado" | "vetado"; motivos: string[]; revisor: string } | null;
  status: string;
  idempotency_key: string | null;
  result?: unknown;
}

export interface ProductSummary { code: string; name: string; status: string; publish_status: string; price_cents: number | null }

export interface AgentStore {
  getState(): Promise<{ killSwitch: boolean; dryRun: boolean }>;
  setKillSwitch(on: boolean, reason: string, automatic: boolean, actor?: string | null): Promise<void>;
  getGuardrails(): Promise<Guardrails>;
  getLevel(agent: string, actionType: string): Promise<number>;
  bumpPolicy(agent: string, actionType: string, outcome: "aprobada" | "rechazada"): Promise<void>;
  getUsage(): Promise<Usage>;
  monthCostMicro(): Promise<number>;

  startRun(r: { agent: string; model: string; taskId: string | null; dryRun: boolean }): Promise<string>;
  finishRun(id: string, patch: Record<string, unknown>): Promise<void>;
  logAction(a: { runId: string | null; agent: string; tool: string; input: unknown; outcome: "ok" | "error" | "propuesta" | "bloqueada"; output?: unknown }): Promise<void>;
  recentToolErrors(sinceMs: number): Promise<{ tool: string; count: number }[]>;
  refundsLast24h(): Promise<number>;

  createProposal(p: Omit<ProposalRow, "id" | "status"> & { status: string }): Promise<{ id: string; duplicate: boolean }>;
  getProposal(id: string): Promise<ProposalRow | null>;
  updateProposal(id: string, patch: Partial<ProposalRow> & Record<string, unknown>): Promise<void>;
  listProposals(status?: string): Promise<ProposalRow[]>;

  createTask(t: { agent: string; title: string; instructions: string; input?: unknown; dedupeKey?: string; parentId?: string | null }): Promise<string | null>;
  readMemory(scope?: string): Promise<{ scope: string; key: string; content: string }[]>;
  writeMemory(scope: string, key: string, content: string, agent: string): Promise<void>;

  listProducts(): Promise<ProductSummary[]>;
  getProduct(code: string): Promise<Record<string, unknown> | null>;
  createProductDraft(p: { name: string; description?: string; price_cents?: number }): Promise<string>;
}

/** In-memory implementation used by tests and evaluations. */
export class MemoryStore implements AgentStore {
  state = { killSwitch: false, dryRun: true };
  guardrails: Guardrails = {};
  levels = new Map<string, number>();
  policyCounts = new Map<string, { approved: number; rejected: number }>();
  usage: Usage = { adsToday: 0, adsWeek: 0, adsMonth: 0, adsProduct: 0, samplesWeek: 0, supplierToday: 0, postsToday: 0, publishedWeek: 0, inTest: 0 };
  cost = 0;
  runs = new Map<string, Record<string, unknown>>();
  actions: Record<string, unknown>[] = [];
  proposals = new Map<string, ProposalRow>();
  tasks: Record<string, unknown>[] = [];
  memory: { scope: string; key: string; content: string }[] = [];
  products: (ProductSummary & Record<string, unknown>)[] = [];
  killEvents: { on: boolean; reason: string; automatic: boolean }[] = [];
  refunds = 0;
  private seq = 0;
  private id = (p: string) => `${p}-${++this.seq}`;

  async getState() { return { ...this.state }; }
  async setKillSwitch(on: boolean, reason: string, automatic: boolean) { this.state.killSwitch = on; this.killEvents.push({ on, reason, automatic }); }
  async getGuardrails() { return { ...this.guardrails }; }
  async getLevel(agent: string, type: string) { return this.levels.get(`${agent}:${type}`) ?? 1; }
  async bumpPolicy(agent: string, type: string, outcome: "aprobada" | "rechazada") {
    const k = `${agent}:${type}`;
    const c = this.policyCounts.get(k) ?? { approved: 0, rejected: 0 };
    if (outcome === "aprobada") c.approved++; else c.rejected++;
    this.policyCounts.set(k, c);
  }
  async getUsage() { return { ...this.usage }; }
  async monthCostMicro() { return this.cost; }
  async startRun(r: { agent: string; model: string; taskId: string | null; dryRun: boolean }) { const id = this.id("run"); this.runs.set(id, { ...r, status: "en_curso" }); return id; }
  async finishRun(id: string, patch: Record<string, unknown>) {
    this.runs.set(id, { ...this.runs.get(id), ...patch });
    this.cost += Number(patch.cost_microusd ?? 0);
  }
  async logAction(a: Record<string, unknown>) { this.actions.push({ ...a, at: Date.now() }); }
  async recentToolErrors(sinceMs: number) {
    const since = Date.now() - sinceMs;
    const counts = new Map<string, number>();
    for (const a of this.actions) if (a.outcome === "error" && Number(a.at) >= since) counts.set(String(a.tool), (counts.get(String(a.tool)) ?? 0) + 1);
    return [...counts].map(([tool, count]) => ({ tool, count }));
  }
  async refundsLast24h() { return this.refunds; }
  async createProposal(p: Omit<ProposalRow, "id">) {
    const dup = p.idempotency_key ? [...this.proposals.values()].find((x) => x.idempotency_key === p.idempotency_key) : undefined;
    if (dup) return { id: dup.id, duplicate: true };
    const id = this.id("prop");
    this.proposals.set(id, { ...p, id } as ProposalRow);
    return { id, duplicate: false };
  }
  async getProposal(id: string) { return this.proposals.get(id) ?? null; }
  async updateProposal(id: string, patch: Partial<ProposalRow>) {
    const cur = this.proposals.get(id);
    if (!cur) return;
    // Mirror of the database guard (agent_proposals_guard).
    if (patch.status === "ejecutada") {
      if (this.state.killSwitch) throw new Error("Parada global activa: no se ejecuta ninguna acción");
      if (["bloquear", "borrador"].includes(cur.decision)) throw new Error(`Esta propuesta no se puede ejecutar (decisión: ${cur.decision})`);
      if (cur.compliance?.veredicto === "vetado") throw new Error("Vetada por Cumplimiento: no se ejecuta");
    }
    this.proposals.set(id, { ...cur, ...patch });
  }
  async listProposals(status?: string) { return [...this.proposals.values()].filter((p) => !status || p.status === status); }
  async createTask(t: { agent: string; title: string; instructions: string; input?: unknown; dedupeKey?: string }) {
    if (t.dedupeKey && this.tasks.some((x) => x.dedupeKey === t.dedupeKey)) return null;
    const id = this.id("task");
    this.tasks.push({ id, ...t, status: "pendiente" });
    return id;
  }
  async readMemory(scope?: string) { return this.memory.filter((m) => !scope || m.scope === scope); }
  async writeMemory(scope: string, key: string, content: string) {
    this.memory = this.memory.filter((m) => !(m.scope === scope && m.key === key));
    this.memory.push({ scope, key, content });
  }
  async listProducts() { return this.products.map(({ code, name, status, publish_status, price_cents }) => ({ code, name, status, publish_status, price_cents })); }
  async getProduct(code: string) { return this.products.find((p) => p.code === code) ?? null; }
  async createProductDraft(p: { name: string; description?: string; price_cents?: number }) {
    const code = `PRD-${String(this.products.length + 1).padStart(4, "0")}`;
    this.products.push({ code, name: p.name, status: "idea", publish_status: "borrador", price_cents: p.price_cents ?? null, description: p.description ?? "" });
    return code;
  }
}
