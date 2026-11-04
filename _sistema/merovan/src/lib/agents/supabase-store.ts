import "server-only";
import type { serviceClient } from "@/lib/admin";
import type { createClient } from "@/lib/supabase/server";
import type { Guardrails, Usage } from "./policy";
import type { AgentStore, ProductSummary, ProposalRow } from "./store";

type Db = Awaited<ReturnType<typeof createClient>> | NonNullable<ReturnType<typeof serviceClient>>;

const DAY = 864e5;
const isoDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const mondayIso = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1)); return isoDay(d.getTime()); };
const monthStart = () => `${isoDay().slice(0, 7)}-01`;
const sumAmounts = (rows: { payload: Record<string, unknown> }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.payload.amount_cents ?? 0), 0);

/** AgentStore backed by Supabase (user session or service role). */
export class SupabaseStore implements AgentStore {
  constructor(private db: Db, private actor: string | null = null) {}

  async getState() {
    const { data } = await this.db.from("system_state").select("kill_switch, dry_run").single();
    return { killSwitch: data?.kill_switch ?? true, dryRun: data?.dry_run ?? true }; // fail safe: stopped + simulated
  }
  async setKillSwitch(on: boolean, reason: string, automatic: boolean, actor?: string | null) {
    await this.db.from("system_state").update({ kill_switch: on, kill_reason: on ? reason : null, updated_by: actor ?? this.actor, updated_at: new Date().toISOString() }).eq("id", true);
    await this.db.from("kill_switch_events").insert({ action: on ? "parar" : "reanudar", reason, automatic, actor: actor ?? this.actor });
  }
  async getGuardrails(): Promise<Guardrails> {
    const { data } = await this.db.from("guardrails").select("key, value");
    return Object.fromEntries((data ?? []).map((g) => [g.key, Number(g.value)]));
  }
  async getLevel(agent: string, actionType: string) {
    const { data } = await this.db.from("autonomy_policies").select("level").eq("agent", agent).eq("action_type", actionType).maybeSingle();
    return data?.level ?? 1;
  }
  async bumpPolicy(agent: string, actionType: string, outcome: "aprobada" | "rechazada") {
    const { data } = await this.db.from("autonomy_policies").select("approved_count, rejected_count").eq("agent", agent).eq("action_type", actionType).maybeSingle();
    const row = { agent, action_type: actionType, level: undefined as number | undefined,
      approved_count: (data?.approved_count ?? 0) + (outcome === "aprobada" ? 1 : 0),
      rejected_count: (data?.rejected_count ?? 0) + (outcome === "rechazada" ? 1 : 0) };
    if (!data) row.level = 1;
    await this.db.from("autonomy_policies").upsert(row, { onConflict: "agent,action_type" });
  }
  async getUsage(): Promise<Usage> {
    const today = isoDay(), week = mondayIso(), month = monthStart();
    const [ads, executed, supplier, inTest] = await Promise.all([
      this.db.from("ad_metrics_daily").select("day, spend_cents").gte("day", month),
      this.db.from("agent_proposals").select("action_type, payload, executed_at").eq("status", "ejecutada").gte("executed_at", week),
      this.db.from("supplier_orders").select("cost_cents, ordered_at").gte("ordered_at", today),
      this.db.from("products").select("*", { count: "exact", head: true }).eq("status", "en_test"),
    ]);
    const adRows = ads.data ?? [];
    const ex = (executed.data ?? []) as { action_type: string; payload: Record<string, unknown>; executed_at: string }[];
    const of = (type: string, from: string) => ex.filter((e) => e.action_type === type && e.executed_at >= from);
    return {
      adsToday: adRows.filter((a) => a.day === today).reduce((s, a) => s + a.spend_cents, 0),
      adsWeek: adRows.filter((a) => a.day >= week).reduce((s, a) => s + a.spend_cents, 0),
      adsMonth: adRows.reduce((s, a) => s + a.spend_cents, 0),
      adsProduct: 0,
      samplesWeek: sumAmounts(of("pedido_muestra", week)),
      supplierToday: (supplier.data ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0),
      postsToday: of("publicar_contenido", today).length,
      publishedWeek: of("publicar_producto", week).length,
      inTest: inTest.count ?? 0,
    };
  }
  async monthCostMicro() {
    const { data } = await this.db.from("agent_runs").select("cost_microusd").gte("started_at", monthStart());
    return (data ?? []).reduce((s, r) => s + Number(r.cost_microusd), 0);
  }
  async startRun(r: { agent: string; model: string; taskId: string | null; dryRun: boolean }) {
    const { data, error } = await this.db.from("agent_runs").insert({ agent: r.agent, model: r.model, task_id: r.taskId, dry_run: r.dryRun }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }
  async finishRun(id: string, patch: Record<string, unknown>) { await this.db.from("agent_runs").update(patch).eq("id", id); }
  async logAction(a: { runId: string | null; agent: string; tool: string; input: unknown; outcome: string; output?: unknown }) {
    await this.db.from("agent_actions").insert({ run_id: a.runId, agent: a.agent, tool: a.tool, input: a.input ?? {}, outcome: a.outcome, output: a.output ?? null });
  }
  async recentToolErrors(sinceMs: number) {
    const { data } = await this.db.from("agent_actions").select("tool").eq("outcome", "error").gte("created_at", new Date(Date.now() - sinceMs).toISOString());
    const c = new Map<string, number>();
    for (const r of data ?? []) c.set(r.tool, (c.get(r.tool) ?? 0) + 1);
    return [...c].map(([tool, count]) => ({ tool, count }));
  }
  async refundsLast24h() {
    const { count } = await this.db.from("returns").select("*", { count: "exact", head: true }).eq("status", "reembolsada").gte("refunded_at", isoDay(Date.now() - DAY));
    return count ?? 0;
  }
  async createProposal(p: Omit<ProposalRow, "id">) {
    const { data, error } = await this.db.from("agent_proposals").insert(p).select("id").single();
    if (error?.code === "23505" && p.idempotency_key) {
      const { data: dup } = await this.db.from("agent_proposals").select("id").eq("idempotency_key", p.idempotency_key).single();
      return { id: dup!.id as string, duplicate: true };
    }
    if (error) throw new Error(error.message);
    return { id: data.id as string, duplicate: false };
  }
  async getProposal(id: string) {
    const { data } = await this.db.from("agent_proposals").select("*").eq("id", id).maybeSingle();
    return (data as ProposalRow) ?? null;
  }
  async updateProposal(id: string, patch: Record<string, unknown>) {
    const decided = patch.status && ["aprobada", "rechazada"].includes(String(patch.status)) ? { decided_by: this.actor, decided_at: new Date().toISOString() } : {};
    const { error } = await this.db.from("agent_proposals").update({ ...patch, ...decided }).eq("id", id);
    if (error) throw new Error(error.message);
  }
  async listProposals(status?: string) {
    let q = this.db.from("agent_proposals").select("*").order("created_at", { ascending: false }).limit(100);
    if (status) q = q.eq("status", status);
    return ((await q).data ?? []) as ProposalRow[];
  }
  async createTask(t: { agent: string; title: string; instructions: string; input?: unknown; dedupeKey?: string; parentId?: string | null }) {
    const { data, error } = await this.db.from("agent_tasks").insert({
      agent: t.agent, title: t.title, instructions: t.instructions, input: t.input ?? {}, dedupe_key: t.dedupeKey ?? null, parent_id: t.parentId ?? null, created_by: this.actor,
    }).select("id").single();
    if (error?.code === "23505") return null;
    if (error) throw new Error(error.message);
    return data.id as string;
  }
  async readMemory(scope?: string) {
    let q = this.db.from("agent_memory").select("scope, key, content").order("created_at", { ascending: false }).limit(50);
    if (scope) q = q.eq("scope", scope);
    return (await q).data ?? [];
  }
  async writeMemory(scope: string, key: string, content: string, agent: string) {
    await this.db.from("agent_memory").upsert({ scope, key, content, agent }, { onConflict: "scope,key" });
  }
  async listProducts(): Promise<ProductSummary[]> {
    return ((await this.db.from("products").select("code, name, status, publish_status, price_cents").order("code")).data ?? []) as ProductSummary[];
  }
  async getProduct(code: string) {
    const { data } = await this.db.from("products")
      .select("code, name, status, publish_status, description, bullets, price_cents, compare_at_cents, gpsr_manufacturer, gpsr_address, gpsr_contact, gpsr_warnings, legal_checks, score_detail")
      .eq("code", code).maybeSingle();
    return data;
  }
  async createProductDraft(p: { name: string; description?: string; price_cents?: number }) {
    const { data: code } = await this.db.rpc("next_code", { prefix: "PRD" });
    const slug = `${p.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${String(code).slice(4)}`;
    const { error } = await this.db.from("products").insert({ code, name: p.name, slug, description: p.description ?? "", price_cents: p.price_cents ?? null, status: "idea", created_by: this.actor });
    if (error) throw new Error(error.message);
    return code as string;
  }
}
