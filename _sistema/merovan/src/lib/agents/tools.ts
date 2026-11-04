// Agent tools: typed, validated with Zod, each declaring whether it returns external data.
// Tools never decide on autonomy: anything that acts goes through propose() and the policy engine.
import { z } from "zod";
import { ACTION_TYPES } from "./policy";
import { propose } from "./pipeline";
import type { AgentStore } from "./store";
import type { Tool } from "./model";

export interface ToolContext { store: AgentStore; agent: string; runId: string | null; taskId: string | null }

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
];

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);
export const toolDefs = (names: string[]): Tool[] =>
  TOOLS.filter((t) => names.includes(t.name)).map((t) => ({ name: t.name, description: t.description, input_schema: t.jsonSchema }));
