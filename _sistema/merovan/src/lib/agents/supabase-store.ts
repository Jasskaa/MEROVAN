import "server-only";
import { loadSettings, marginDefaults, type serviceClient } from "@/lib/admin";
import type { createClient } from "@/lib/supabase/server";
import type { Guardrails, Usage } from "./policy";
import { runDecisionEngine } from "@/lib/decisions";
import { loadFinance } from "@/lib/finance";
import { DEFAULT_RULES, type DecisionRules } from "@/lib/domain/decision";
import { computeMargin } from "@/lib/domain/margin";
import type { AdRow } from "./ads";
import type { MarginDefaults } from "./research";
import type { AgentStore, CalendarEntry, FinanceData, OpsOverview, CandidateRow, CreativeView, ScriptInput, NewCandidate, NicheInput, ProductSummary, ProposalRow, ResearchNiche, SupplierOfferView } from "./store";

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

  async marginDefaults(): Promise<MarginDefaults> { return marginDefaults(await loadSettings(this.db)); }
  async createNiche(n: NicheInput) {
    const { data, error } = await this.db.from("niches").insert({ name: n.name, thesis: n.thesis, audience: n.audience, evidence: n.evidence, risks: n.risks, confidence: n.confidence, demo: n.demo, agent: n.agent, run_id: n.runId }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }
  async addCandidate(c: NewCandidate) {
    const { data, error } = await this.db.from("niche_candidates").insert(c).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }
  async getCandidate(id: string) {
    const { data } = await this.db.from("niche_candidates").select("*").eq("id", id).maybeSingle();
    return data as CandidateRow | null;
  }
  async updateCandidate(id: string, patch: Partial<CandidateRow>) {
    const { error } = await this.db.from("niche_candidates").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }
  async listResearch() {
    const { data } = await this.db.from("niches").select("id, name, thesis, confidence, status, candidates:niche_candidates(*)").neq("status", "descartado").order("created_at", { ascending: false }).limit(20);
    return (data ?? []) as ResearchNiche[];
  }
  async listSupplierOffers(): Promise<SupplierOfferView[]> {
    const { data } = await this.db.from("supplier_offers")
      .select("role, unit_cost_cents, shipping_cents, promised_days, measured_days, product:products(code), supplier:suppliers(name, warehouse_country, reliability)").limit(100);
    return (data ?? []).map((o) => {
      const r = o as unknown as { role: string; unit_cost_cents: number; shipping_cents: number; promised_days: number | null; measured_days: number | null; product: { code: string } | null; supplier: { name: string; warehouse_country: string | null; reliability: number | null } | null };
      return { product: r.product?.code ?? "", supplier: r.supplier?.name ?? "", warehouse_country: r.supplier?.warehouse_country ?? null, role: r.role, unit_cost_cents: r.unit_cost_cents, shipping_cents: r.shipping_cents, promised_days: r.promised_days, measured_days: r.measured_days, reliability: r.supplier?.reliability ?? null };
    });
  }

  async getListing(code: string) {
    const { data: p } = await this.db.from("products")
      .select("code, name, description, bullets, price_cents, compare_at_cents, publish_status, gpsr_manufacturer, gpsr_address, gpsr_contact, gpsr_warnings, legal_red_flag, product_variants(sku, stock), product_media(kind)")
      .eq("code", code).maybeSingle();
    if (!p) return null;
    const media = (p.product_media ?? []) as { kind: string }[];
    return {
      code: p.code, publishStatus: p.publish_status, name: p.name, description: p.description ?? "", bullets: p.bullets ?? [],
      priceCents: p.price_cents, compareAtCents: p.compare_at_cents, gpsrManufacturer: p.gpsr_manufacturer, gpsrAddress: p.gpsr_address,
      gpsrContact: p.gpsr_contact, gpsrWarnings: p.gpsr_warnings, legalRedFlag: p.legal_red_flag,
      imageCount: media.filter((m) => m.kind === "image").length, videoCount: media.filter((m) => m.kind === "video").length,
      variants: (p.product_variants ?? []) as { sku: string; stock: number }[],
    };
  }
  async saveListingText(code: string, t: { description: string; bullets: string[]; gpsr_warnings?: string }) {
    const { error } = await this.db.from("products").update(t).eq("code", code).neq("publish_status", "publicado");
    if (error) throw new Error(error.message);
  }
  async setPublished(code: string, priceCents?: number) {
    const { error } = await this.db.from("products").update({ publish_status: "publicado", ...(priceCents != null ? { price_cents: priceCents } : {}) }).eq("code", code);
    if (error) throw new Error(error.message);
  }

  private async productId(code: string) {
    const { data } = await this.db.from("products").select("id").eq("code", code).maybeSingle();
    if (!data) throw new Error("Producto no encontrado");
    return data.id as string;
  }
  async createScript(i: ScriptInput) {
    const product_id = await this.productId(i.productCode);
    const { data: code } = await this.db.rpc("next_code", { prefix: "GUI" });
    const { error } = await this.db.from("scripts").insert({
      code, product_id, angle: i.angle, hook: i.hook, problem: i.problem, demo: i.demo, proof: i.proof, offer: i.offer, cta: i.cta,
      contains_ai: i.containsAi, ejemplo: i.ejemplo, created_by: this.actor,
    });
    if (error) throw new Error(error.message);
    return code as string;
  }
  async createCreative(i: { productCode: string; scriptCode?: string; hook: string; angle: string; platforms: string[]; containsAi: boolean; ejemplo: boolean }) {
    const product_id = await this.productId(i.productCode);
    const script = i.scriptCode ? (await this.db.from("scripts").select("id").eq("code", i.scriptCode).maybeSingle()).data : null;
    if (i.scriptCode && !script) throw new Error("Guion no encontrado");
    const { data: code } = await this.db.rpc("next_code", { prefix: "CRE" });
    const { error } = await this.db.from("creatives").insert({
      code, product_id, script_id: script?.id ?? null, hook: i.hook, angle: i.angle, platforms: i.platforms, status: "idea",
      contains_ai: i.containsAi, ejemplo: i.ejemplo, created_by: this.actor,
    });
    if (error) throw new Error(error.message);
    return code as string;
  }
  async listCreatives(): Promise<CreativeView[]> {
    const { data } = await this.db.from("creatives").select("code, hook, angle, status, contains_ai, platforms, product:products(code), script:scripts(code)").order("created_at", { ascending: false }).limit(50);
    return (data ?? []).map((c) => {
      const r = c as unknown as { code: string; hook: string; angle: string; status: string; contains_ai: boolean; platforms: string[]; product: { code: string } | null; script: { code: string } | null };
      return { code: r.code, product: r.product?.code ?? "", hook: r.hook, angle: r.angle, status: r.status, contains_ai: r.contains_ai, platforms: r.platforms, script: r.script?.code ?? null };
    });
  }
  async schedule(i: { day: string; platform: string; title: string; caption: string; creativeCode: string; ejemplo: boolean }) {
    const { data: cr } = await this.db.from("creatives").select("id").eq("code", i.creativeCode).maybeSingle();
    if (!cr) throw new Error("Creatividad no encontrada");
    const { data, error } = await this.db.from("content_calendar").insert({ day: i.day, platform: i.platform, kind: "organico", title: i.title, caption: i.caption, creative_id: cr.id, ejemplo: i.ejemplo }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }
  async listCalendar(fromDay: string): Promise<CalendarEntry[]> {
    const { data } = await this.db.from("content_calendar").select("id, day, platform, title, caption, done, proposal_id, creative:creatives(code)").gte("day", fromDay).order("day").limit(60);
    return (data ?? []).map((c) => {
      const r = c as unknown as CalendarEntry & { creative: { code: string } | null };
      return { id: r.id, day: r.day, platform: r.platform, title: r.title, caption: r.caption, done: r.done, proposal_id: r.proposal_id, creative: r.creative?.code ?? null };
    });
  }
  async linkCalendarProposal(id: string, proposalId: string) {
    await this.db.from("content_calendar").update({ proposal_id: proposalId }).eq("id", id);
  }

  async adRows(days: number): Promise<AdRow[]> {
    const from = isoDay(Date.now() - days * DAY);
    const [{ data: rows }, { data: products }, { data: campaigns }, guardrails, settings] = await Promise.all([
      this.db.from("ad_metrics_daily").select("platform, campaign_name, ad_name, product_id, impressions, clicks, spend_cents, purchases, revenue_cents").gte("day", from),
      this.db.from("products").select("id, code, price_cents, vat_rate, supplier_offers(role, unit_cost_cents, shipping_cents)"),
      this.db.from("campaigns").select("name, test_cap_cents"),
      this.getGuardrails(),
      loadSettings(this.db),
    ]);
    const defaults = marginDefaults(settings);
    const byProduct = new Map((products ?? []).map((p) => {
      const offer = (p.supplier_offers ?? []).find((o: { role: string }) => o.role === "principal") as { unit_cost_cents: number; shipping_cents: number } | undefined;
      const m = p.price_cents && offer
        ? computeMargin({ ...defaults, priceWithVat: p.price_cents / 100, vatRate: Number(p.vat_rate), productCost: offer.unit_cost_cents / 100, shippingCost: offer.shipping_cents / 100 })
        : null;
      return [p.id as string, { code: p.code as string, beCpa: m ? Math.round(m.breakEvenCpa * 100) : null }];
    }));
    const caps = new Map((campaigns ?? []).filter((c) => c.test_cap_cents != null).map((c) => [c.name as string, c.test_cap_cents as number]));
    const productCap = guardrails.ads_product_max || null;
    const ads = new Map<string, AdRow>();
    for (const r of rows ?? []) {
      const k = `${r.platform}|${r.campaign_name}|${r.ad_name}`;
      const prod = r.product_id ? byProduct.get(r.product_id) : undefined;
      const a = ads.get(k) ?? {
        platform: r.platform, campaign: r.campaign_name, ad: r.ad_name, product: prod?.code ?? null,
        impressions: 0, clicks: 0, spend_cents: 0, purchases: 0, revenue_cents: 0,
        test_cap_cents: caps.get(r.campaign_name) ?? productCap, break_even_cpa_cents: prod?.beCpa ?? null,
      };
      a.impressions += r.impressions; a.clicks += r.clicks; a.spend_cents += r.spend_cents; a.purchases += r.purchases; a.revenue_cents += r.revenue_cents;
      ads.set(k, a);
    }
    return [...ads.values()];
  }
  async decisionRules(): Promise<DecisionRules> {
    const s = await loadSettings(this.db);
    return { ...DEFAULT_RULES, ...((s.decision_rules as Partial<DecisionRules>) ?? {}) };
  }
  async runDecisions() { return runDecisionEngine(this.db); }

  async opsOverview(): Promise<OpsOverview> {
    const today = isoDay();
    const [{ data: paid }, { data: late }, { data: tickets }, { data: returns }] = await Promise.all([
      this.db.from("orders").select("number, total_cents, paid_at, order_items(quantity, unit_cost_cents), supplier_orders(id)").eq("status", "pagado").order("paid_at").limit(50),
      this.db.from("orders").select("number, status, promised_delivery_on").in("status", ["pagado", "enviado_proveedor", "enviado"]).lt("promised_delivery_on", today).limit(50),
      this.db.from("tickets").select("number, type, subject, created_at, first_response_at, orders(number)").neq("status", "resuelto").order("created_at").limit(50),
      this.db.from("returns").select("id, status, refund_cents, reason, orders(number)").in("status", ["solicitada", "aprobada", "recibida"]).limit(50),
    ]);
    type Paid = { number: number; total_cents: number; paid_at: string; order_items: { quantity: number; unit_cost_cents: number | null }[]; supplier_orders: { id: string } | null };
    return {
      sin_pedido_proveedor: ((paid ?? []) as unknown as Paid[]).filter((o) => !o.supplier_orders).map((o) => ({
        number: o.number, total_cents: o.total_cents, pagado: o.paid_at,
        coste_estimado_cents: o.order_items.reduce((s, i) => s + (i.unit_cost_cents ?? 0) * i.quantity, 0),
      })),
      retrasados: (late ?? []).map((o) => ({ number: o.number, status: o.status, entrega_prometida: o.promised_delivery_on })),
      tickets_abiertos: (tickets ?? []).map((t) => {
        const r = t as unknown as { number: number; type: string; subject: string; created_at: string; first_response_at: string | null; orders: { number: number } | null };
        return { number: r.number, type: r.type, subject: r.subject, pedido: r.orders?.number ?? null, abierto: r.created_at, sin_respuesta: !r.first_response_at };
      }),
      devoluciones: (returns ?? []).map((x) => {
        const r = x as unknown as { id: string; status: string; refund_cents: number; reason: string; orders: { number: number } | null };
        return { id: r.id, pedido: r.orders?.number ?? 0, status: r.status, refund_cents: r.refund_cents, reason: r.reason };
      }),
    };
  }
  async finance(from: string, to: string): Promise<FinanceData> {
    const f = await loadFinance(this.db as Parameters<typeof loadFinance>[0], from, to);
    const { data: exp } = await this.db.from("expenses").select("amount_cents, category").gte("spent_on", from).lte("spent_on", to);
    return {
      orders: f.profitOrders,
      adSpend: f.adSpend,
      // Ad spend is already counted per product from the imported metrics: not twice as an expense.
      expensesCents: (exp ?? []).filter((e) => e.category !== "publicidad").reduce((s, e) => s + e.amount_cents, 0),
      codes: Object.fromEntries([...f.products].map(([id, p]) => [id, p.code])),
      recon: f.rows.map((o) => ({
        number: o.number, channel: o.channel, status: o.status, total_cents: o.total_cents, payment_ref: o.payment_ref, external_ref: o.external_ref,
        supplier_cost_cents: o.supplier_orders?.cost_cents ?? null,
        refunded_cents: o.returns.filter((r) => r.status === "reembolsada").reduce((s, r) => s + r.refund_cents, 0),
      })),
    };
  }

  async claimTask() {
    const now = new Date().toISOString();
    const { data: candidates } = await this.db.from("agent_tasks").select("id, attempts, max_attempts")
      .eq("status", "pendiente").or(`locked_until.is.null,locked_until.lt.${now}`).order("priority").order("created_at").limit(5);
    for (const c of candidates ?? []) {
      // Optimistic claim: only succeeds if nobody changed the task since we read it.
      const { data } = await this.db.from("agent_tasks")
        .update({ status: "en_curso", attempts: c.attempts + 1, locked_until: new Date(Date.now() + 15 * 60_000).toISOString() })
        .eq("id", c.id).eq("status", "pendiente").eq("attempts", c.attempts)
        .select("id, agent, title, instructions, attempts, max_attempts").maybeSingle();
      if (data) return { id: data.id, agent: data.agent, title: data.title, instructions: data.instructions, attempts: data.attempts, maxAttempts: data.max_attempts };
    }
    return null;
  }
  async finishTask(id: string, status: string, result: Record<string, unknown>) {
    // A task that goes back to the queue waits 10 minutes before its retry.
    const lockedUntil = status === "pendiente" ? new Date(Date.now() + 10 * 60_000).toISOString() : null;
    await this.db.from("agent_tasks").update({ status, result, locked_until: lockedUntil, ...(status === "fallida" ? { error: String(result.resumen ?? "") } : {}) }).eq("id", id);
  }
}
