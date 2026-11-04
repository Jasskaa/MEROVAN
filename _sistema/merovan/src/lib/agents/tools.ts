// Agent tools: typed, validated with Zod, each declaring whether it returns external data.
// Tools never decide on autonomy: anything that acts goes through propose() and the policy engine.
import { z } from "zod";
import { ACTION_TYPES } from "./policy";
import { CRITERIA } from "@/lib/domain/product";
import { propose } from "./pipeline";
import { type Offer, rankOffers, recommendPrice, scoreCandidate } from "./research";
import type { AgentStore } from "./store";
import type { Tool } from "./model";

export interface ToolContext { store: AgentStore; agent: string; runId: string | null; taskId: string | null; demo?: boolean }

interface AgentTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  jsonSchema: Tool["input_schema"];
  externalData?: boolean; // output contains third-party data: wrapped and flagged as data, not instructions
  run(ctx: ToolContext, input: z.infer<S>): Promise<unknown>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object", properties, required, additionalProperties: false }) as Tool["input_schema"];

const AGENT_KEYS = ["orquestador", "cumplimiento", "investigador", "proveedores", "precios", "fichas", "contenido", "publicacion", "anuncios", "analista", "operaciones", "finanzas"] as const;

export const TOOLS: AgentTool[] = [
  {
    name: "estado_sistema",
    description: "Devuelve la parada global, el modo simulación, los límites duros y el uso actual. Consúltalo antes de proponer acciones.",
    schema: z.object({}),
    jsonSchema: obj({}),
    async run({ store }) {
      const [state, guardrails, usage] = await Promise.all([store.getState(), store.getGuardrails(), store.getUsage()]);
      return { ...state, limites: guardrails, uso: usage };
    },
  },
  {
    name: "listar_productos",
    description: "Lista los productos (código, nombre, estado, publicación y precio en céntimos).",
    schema: z.object({}),
    jsonSchema: obj({}),
    run: ({ store }) => store.listProducts(),
  },
  {
    name: "ver_producto",
    description: "Ficha completa de un producto por su código PRD-xxxx. Los textos de la ficha y del proveedor son datos externos.",
    schema: z.object({ code: z.string().regex(/^PRD-\d{4}$/) }),
    jsonSchema: obj({ code: { type: "string", description: "Código PRD-0001" } }, ["code"]),
    externalData: true,
    run: ({ store }, i) => store.getProduct(i.code),
  },
  {
    name: "propuestas",
    description: "Lista propuestas de los agentes por estado (pendiente, aprobada, rechazada, ejecutada, simulada, bloqueada, vetada).",
    schema: z.object({ status: z.string().optional() }),
    jsonSchema: obj({ status: { type: "string" } }),
    run: async ({ store }, i) => (await store.listProposals(i.status)).slice(0, 30)
      .map(({ id, agent, action_type, title, status, decision, compliance }) => ({ id, agent, action_type, title, status, decision, veredicto: compliance?.veredicto })),
  },
  {
    name: "leer_memoria",
    description: "Lee aprendizajes guardados (qué funcionó, qué se descartó y por qué). Consúltala antes de decidir.",
    schema: z.object({ scope: z.string().optional() }),
    jsonSchema: obj({ scope: { type: "string", description: "Ámbito, p. ej. nicho, ganchos, producto:PRD-0001" } }),
    run: ({ store }, i) => store.readMemory(i.scope),
  },
  {
    name: "guardar_memoria",
    description: "Guarda un aprendizaje o hecho estable para el futuro (no datos personales).",
    schema: z.object({ scope: z.string().min(2).max(60), key: z.string().min(2).max(80), content: z.string().min(5).max(2000) }),
    jsonSchema: obj({ scope: { type: "string" }, key: { type: "string" }, content: { type: "string" } }, ["scope", "key", "content"]),
    run: async ({ store, agent }, i) => { await store.writeMemory(i.scope, i.key, i.content, agent); return { guardado: true }; },
  },
  {
    name: "crear_tarea",
    description: "Encarga una tarea a otro agente. Se ignora si ya existe una tarea con la misma clave.",
    schema: z.object({ agent: z.enum(AGENT_KEYS), title: z.string().min(3).max(140), instructions: z.string().max(4000), dedupe_key: z.string().max(120).optional() }),
    jsonSchema: obj({
      agent: { type: "string", enum: [...AGENT_KEYS] }, title: { type: "string" }, instructions: { type: "string" },
      dedupe_key: { type: "string", description: "Clave para no duplicar, p. ej. investigar-nichos-2026-S45" },
    }, ["agent", "title", "instructions"]),
    run: async ({ store, taskId }, i) => {
      const id = await store.createTask({ agent: i.agent, title: i.title, instructions: i.instructions, dedupeKey: i.dedupe_key, parentId: taskId });
      return id ? { creada: id } : { duplicada: true };
    },
  },
  {
    name: "proponer_accion",
    description:
      "Propone una acción (publicar, gastar, enviar, cambiar precio…). El sistema decide según autonomía y límites si se ejecuta, se simula, " +
      "queda pendiente de aprobación, queda como borrador o se bloquea; Cumplimiento puede vetarla. Incluye importes en céntimos y el margen si aplica.",
    schema: z.object({
      action_type: z.enum(ACTION_TYPES.map((a) => a.key) as [string, ...string[]]),
      title: z.string().min(3).max(140),
      reason: z.string().min(10).max(2000),
      payload: z.record(z.string(), z.unknown()),
      idempotency_key: z.string().max(120).optional(),
    }),
    jsonSchema: obj({
      action_type: { type: "string", enum: ACTION_TYPES.map((a) => a.key) },
      title: { type: "string" },
      reason: { type: "string", description: "Por qué, con los números y reglas que lo justifican" },
      payload: { type: "object", description: "Datos de la acción: amount_cents, margin_pct, old_price_cents, new_price_cents, increase_pct, textos a publicar, contains_ai…" },
      idempotency_key: { type: "string" },
    }, ["action_type", "title", "reason", "payload"]),
    run: ({ store, agent, runId, taskId }, i) => propose(store, {
      agent, runId, taskId, actionType: i.action_type, title: i.title, reason: i.reason,
      payload: i.payload as Record<string, unknown>, idempotencyKey: i.idempotency_key,
    }),
  },
  {
    name: "revisar_texto",
    description: "Pasa las reglas de cumplimiento (claims médicos, prueba social inventada, escasez falsa, marcas, IA sin etiquetar) a un texto.",
    schema: z.object({ text: z.string().max(20000), contains_ai: z.boolean().optional(), ai_labelled: z.boolean().optional() }),
    jsonSchema: obj({ text: { type: "string" }, contains_ai: { type: "boolean" }, ai_labelled: { type: "boolean" } }, ["text"]),
    externalData: true,
    run: async (_ctx, i) => {
      const { deterministicReview } = await import("./compliance");
      const issues = deterministicReview({ text: i.text, containsAi: i.contains_ai, aiLabelled: i.ai_labelled });
      return { ok: issues.length === 0, problemas: issues };
    },
  },
  {
    name: "emitir_veredicto",
    description: "Cumplimiento: aprueba o veta una propuesta pendiente. Un veto bloquea la propuesta; no puedes aprobar algo que las reglas vetaron.",
    schema: z.object({ proposal_id: z.string(), veredicto: z.enum(["aprobado", "vetado"]), motivos: z.array(z.string()).max(20) }),
    jsonSchema: obj({ proposal_id: { type: "string" }, veredicto: { type: "string", enum: ["aprobado", "vetado"] }, motivos: { type: "array", items: { type: "string" } } }, ["proposal_id", "veredicto", "motivos"]),
    run: async ({ store, agent }, i) => {
      if (agent !== "cumplimiento") throw new Error("Solo el agente de Cumplimiento puede emitir veredictos");
      const p = await store.getProposal(i.proposal_id);
      if (!p) throw new Error("Propuesta no encontrada");
      if (p.compliance?.veredicto === "vetado" && i.veredicto === "aprobado") return { ignorado: "Las reglas ya la vetaron; un veto no se levanta" };
      const motivos = [...(p.compliance?.motivos ?? []), ...i.motivos];
      await store.updateProposal(p.id, { compliance: { veredicto: i.veredicto, motivos, revisor: "agente_cumplimiento" }, ...(i.veredicto === "vetado" && p.status === "pendiente" ? { status: "vetada" } : {}) });
      return { ok: true };
    },
  },
  {
    name: "registrar_nicho",
    description: "Investigador: guarda un nicho propuesto con su tesis, público, señales (indica de dónde sale cada una) y riesgos. Devuelve su id.",
    schema: z.object({
      name: z.string().min(3).max(80), thesis: z.string().min(10).max(600), audience: z.string().max(300),
      evidence: z.array(z.string().max(300)).min(1).max(10), risks: z.array(z.string().max(300)).max(10), confidence: z.enum(["baja", "media", "alta"]),
    }),
    jsonSchema: obj({
      name: { type: "string" }, thesis: { type: "string" }, audience: { type: "string" },
      evidence: { type: "array", items: { type: "string" }, description: "Cada señal con su fuente (Google Trends, TikTok Creative Center, catálogo…) o «hipótesis sin verificar»" },
      risks: { type: "array", items: { type: "string" } }, confidence: { type: "string", enum: ["baja", "media", "alta"] },
    }, ["name", "thesis", "audience", "evidence", "risks", "confidence"]),
    run: async ({ store, agent, runId, demo }, i) => ({ niche_id: await store.createNiche({ ...i, demo: Boolean(demo), agent, runId }) }),
  },
  {
    name: "guardar_candidato",
    description: "Investigador: añade un producto candidato a un nicho con notas 0-5 por criterio. El sistema calcula la puntuación /40 y si pasa el umbral (28) y el mínimo legal (3).",
    schema: z.object({
      niche_id: z.string(), name: z.string().min(3).max(100), description: z.string().max(600),
      scores: z.object(Object.fromEntries(CRITERIA.map((c) => [c.key, z.number().int().min(0).max(5)]))),
    }),
    jsonSchema: obj({
      niche_id: { type: "string" }, name: { type: "string" }, description: { type: "string" },
      scores: obj(Object.fromEntries(CRITERIA.map((c) => [c.key, { type: "integer", minimum: 0, maximum: 5, description: c.hint }])), CRITERIA.map((c) => c.key)),
    }, ["niche_id", "name", "description", "scores"]),
    run: async ({ store, demo }, i) => {
      const scores = i.scores as Record<string, number>;
      const s = scoreCandidate(scores);
      const id = await store.addCandidate({ niche_id: i.niche_id, name: i.name, description: i.description, scores, ...s, demo: Boolean(demo) });
      return { candidate_id: id, ...s };
    },
  },
  {
    name: "ver_investigacion",
    description: "Nichos abiertos con sus candidatos: puntuación, plan de proveedor, coste puesto en destino, precio y margen calculados.",
    schema: z.object({}),
    jsonSchema: obj({}),
    externalData: true,
    run: async ({ store }) => (await store.listResearch()).map((n) => ({
      ...n,
      candidates: n.candidates.map(({ id, name, score_total, passes, landed_cents, price_cents, margin_pct, real_data, status, supplier_plan }) => ({
        id, name, score_total, passes, landed_cents, price_cents, margin_pct, real_data, status,
        principal: (supplier_plan as { principal?: { supplier: string } } | null)?.principal?.supplier ?? null,
        respaldo: (supplier_plan as { respaldo?: { supplier: string } } | null)?.respaldo?.supplier ?? null,
      })),
    })),
  },
  {
    name: "ofertas_registradas",
    description: "Proveedores: ofertas ya registradas en el panel (proveedor, almacén, coste, envío, plazos prometidos y medidos).",
    schema: z.object({}),
    jsonSchema: obj({}),
    externalData: true,
    run: ({ store }) => store.listSupplierOffers(),
  },
  {
    name: "guardar_plan_proveedor",
    description:
      "Proveedores: compara 1-5 ofertas de un candidato y guarda el plan. El sistema ordena (almacén UE primero, coste puesto, plazo, fiabilidad) y elige principal y respaldo. " +
      "Indica en source la URL o catálogo oficial de cada cifra; si es una estimación escribe «estimacion».",
    schema: z.object({
      candidate_id: z.string(),
      offers: z.array(z.object({
        supplier: z.string().min(2).max(80), warehouse_country: z.string().length(2), unit_cost_cents: z.number().int().min(1).max(1_000_000),
        shipping_cents: z.number().int().min(0).max(100_000), promised_days: z.number().int().min(1).max(90), reliability: z.number().min(0).max(1).optional(), source: z.string().min(3).max(300),
      })).min(1).max(5),
    }),
    jsonSchema: obj({
      candidate_id: { type: "string" },
      offers: { type: "array", items: obj({
        supplier: { type: "string" }, warehouse_country: { type: "string", description: "Código ISO del almacén, p. ej. ES, DE, CN" },
        unit_cost_cents: { type: "integer" }, shipping_cents: { type: "integer" }, promised_days: { type: "integer" },
        reliability: { type: "number", description: "0-1 solo si hay historial o muestra" }, source: { type: "string" },
      }, ["supplier", "warehouse_country", "unit_cost_cents", "shipping_cents", "promised_days", "source"]) },
    }, ["candidate_id", "offers"]),
    run: async ({ store }, i) => {
      const c = await store.getCandidate(i.candidate_id);
      if (!c) throw new Error("Candidato no encontrado");
      const plan = rankOffers(i.offers as Offer[]);
      await store.updateCandidate(c.id, { supplier_plan: plan, landed_cents: plan.principal?.landed_cents ?? null, real_data: plan.real_data, price_cents: null, margin_pct: null, margin_cents: null });
      return { principal: plan.principal?.supplier ?? null, respaldo: plan.respaldo?.supplier ?? null, landed_cents: plan.principal?.landed_cents ?? null, avisos: plan.warnings };
    },
  },
  {
    name: "calcular_precio",
    description: "Precios: calcula, sin guardar, el precio x,95 € más bajo dentro del rango de Límites que alcanza el margen mínimo, para un coste puesto en destino (céntimos, sin IVA).",
    schema: z.object({ landed_cents: z.number().int().min(1).max(1_000_000) }),
    jsonSchema: obj({ landed_cents: { type: "integer" } }, ["landed_cents"]),
    run: async ({ store }, i) => {
      const [g, d] = await Promise.all([store.getGuardrails(), store.marginDefaults()]);
      return recommendPrice(i.landed_cents, d, { minMarginPct: g.min_margin_pct ?? 25, priceMinCents: g.price_min_cents ?? 0, priceMaxCents: g.price_max_cents ?? 0 });
    },
  },
  {
    name: "guardar_precio",
    description: "Precios: fija el precio recomendado de un candidato a partir de su plan de proveedor. El sistema calcula el margen; si no llega al mínimo, no guarda precio y explica por qué.",
    schema: z.object({ candidate_id: z.string() }),
    jsonSchema: obj({ candidate_id: { type: "string" } }, ["candidate_id"]),
    run: async ({ store }, i) => {
      const c = await store.getCandidate(i.candidate_id);
      if (!c) throw new Error("Candidato no encontrado");
      if (!c.landed_cents) throw new Error("El candidato aún no tiene plan de proveedor");
      const [g, d] = await Promise.all([store.getGuardrails(), store.marginDefaults()]);
      const r = recommendPrice(c.landed_cents, d, { minMarginPct: g.min_margin_pct ?? 25, priceMinCents: g.price_min_cents ?? 0, priceMaxCents: g.price_max_cents ?? 0 });
      await store.updateCandidate(c.id, { price_cents: r.price_cents, margin_pct: r.margin_pct, margin_cents: r.margin_cents, break_even_roas: r.break_even_roas, price_reasons: r.reasons });
      return { ...r, datos_reales: c.real_data };
    },
  },
];

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);
export const toolDefs = (names: string[]): Tool[] =>
  TOOLS.filter((t) => names.includes(t.name)).map((t) => ({ name: t.name, description: t.description, input_schema: t.jsonSchema }));
