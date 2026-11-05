// Agent tools: typed, validated with Zod, each declaring whether it returns external data.
// Tools never decide on autonomy: anything that acts goes through propose() and the policy engine.
import { z } from "zod";
import { ACTION_TYPES } from "./policy";
import { validateListing } from "@/lib/domain/listing";
import { CRITERIA } from "@/lib/domain/product";
import { adKey, reviewAd } from "./ads";
import { propose } from "./pipeline";
import { type Offer, rankOffers, recommendPrice, scoreCandidate } from "./research";
import { ANGLES, type AgentStore } from "./store";
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
  {
    name: "ver_ficha",
    description: "Fichas: estado de la ficha de un producto (textos, precio, GPSR, fotos, variantes) y su validación para publicar: errores que bloquean y avisos.",
    schema: z.object({ code: z.string().regex(/^PRD-\d{4}$/) }),
    jsonSchema: obj({ code: { type: "string", description: "Código PRD-0001" } }, ["code"]),
    externalData: true,
    run: async ({ store }, i) => {
      const l = await store.getListing(i.code);
      if (!l) throw new Error("Producto no encontrado");
      return { ficha: l, validacion: validateListing(l) };
    },
  },
  {
    name: "redactar_ficha",
    description:
      "Fichas: escribe la descripción, 3-5 puntos clave y las advertencias de un producto NO publicado. Se rechaza si contiene claims prohibidos. " +
      "Para cambiar la ficha de un producto publicado, no uses esto: propón la acción.",
    schema: z.object({
      code: z.string().regex(/^PRD-\d{4}$/), description: z.string().min(40).max(3000),
      bullets: z.array(z.string().min(3).max(200)).min(3).max(5), gpsr_warnings: z.string().max(1000).optional(),
    }),
    jsonSchema: obj({
      code: { type: "string" }, description: { type: "string" }, bullets: { type: "array", items: { type: "string" } },
      gpsr_warnings: { type: "string", description: "Advertencias de seguridad del fabricante, si las hay" },
    }, ["code", "description", "bullets"]),
    run: async ({ store }, i) => {
      const l = await store.getListing(i.code);
      if (!l) throw new Error("Producto no encontrado");
      if (l.publishStatus === "publicado") throw new Error("El producto está publicado: propón el cambio con proponer_accion");
      const { deterministicReview } = await import("./compliance");
      const issues = deterministicReview({ text: [i.description, ...i.bullets, i.gpsr_warnings ?? ""].join("\n") });
      if (issues.length) throw new Error(`Texto rechazado: ${issues.join("; ")}`);
      await store.saveListingText(i.code, { description: i.description, bullets: i.bullets, ...(i.gpsr_warnings ? { gpsr_warnings: i.gpsr_warnings } : {}) });
      const after = await store.getListing(i.code);
      return { guardado: true, validacion: validateListing(after!) };
    },
  },
  {
    name: "crear_guion",
    description:
      "Contenido: guarda un guion de vídeo corto para un producto (gancho de 1-2 s, problema, demostración, prueba, oferta, llamada a la acción). " +
      "Se rechaza si contiene claims prohibidos, prueba social inventada o urgencia falsa. La prueba solo puede ser una demostración o un dato verificable.",
    schema: z.object({
      code: z.string().regex(/^PRD-\d{4}$/), angle: z.enum(ANGLES), hook: z.string().min(5).max(150), problem: z.string().max(500),
      demo: z.string().max(800), proof: z.string().max(500), offer: z.string().max(300), cta: z.string().max(200), contains_ai: z.boolean(),
    }),
    jsonSchema: obj({
      code: { type: "string" }, angle: { type: "string", enum: [...ANGLES] }, hook: { type: "string" }, problem: { type: "string" },
      demo: { type: "string" }, proof: { type: "string" }, offer: { type: "string" }, cta: { type: "string" },
      contains_ai: { type: "boolean", description: "true si la pieza usará imagen, voz o vídeo generados con IA" },
    }, ["code", "angle", "hook", "problem", "demo", "proof", "offer", "cta", "contains_ai"]),
    run: async ({ store, demo }, i) => {
      const { deterministicReview } = await import("./compliance");
      const issues = deterministicReview({ text: [i.hook, i.problem, i.demo, i.proof, i.offer, i.cta].join("\n") });
      if (issues.length) throw new Error(`Guion rechazado: ${issues.join("; ")}`);
      return { guion: await store.createScript({ productCode: i.code, angle: i.angle, hook: i.hook, problem: i.problem, demo: i.demo, proof: i.proof, offer: i.offer, cta: i.cta, containsAi: i.contains_ai, ejemplo: Boolean(demo) }) };
    },
  },
  {
    name: "crear_creatividad",
    description: "Contenido: crea una pieza en el banco de creatividades (estado idea) a partir de un guion, con sus plataformas. La grabación y edición las hace una persona o la herramienta conectada.",
    schema: z.object({
      code: z.string().regex(/^PRD-\d{4}$/), script: z.string().regex(/^GUI-\d{4}$/).optional(), hook: z.string().min(5).max(150),
      angle: z.enum(ANGLES), platforms: z.array(z.enum(["tiktok", "meta"])).min(1), contains_ai: z.boolean(),
    }),
    jsonSchema: obj({
      code: { type: "string" }, script: { type: "string", description: "GUI-0001" }, hook: { type: "string" }, angle: { type: "string", enum: [...ANGLES] },
      platforms: { type: "array", items: { type: "string", enum: ["tiktok", "meta"] } }, contains_ai: { type: "boolean" },
    }, ["code", "hook", "angle", "platforms", "contains_ai"]),
    run: async ({ store, demo }, i) => ({
      creatividad: await store.createCreative({ productCode: i.code, scriptCode: i.script, hook: i.hook, angle: i.angle, platforms: i.platforms, containsAi: i.contains_ai, ejemplo: Boolean(demo) }),
    }),
  },
  {
    name: "banco_creatividades",
    description: "Banco de creatividades: código, producto, gancho, ángulo, estado, plataformas y si lleva IA.",
    schema: z.object({}),
    jsonSchema: obj({}),
    externalData: true,
    run: ({ store }) => store.listCreatives(),
  },
  {
    name: "ver_calendario",
    description: "Publicación: calendario de contenido desde hoy (día, plataforma, pieza, texto y propuesta asociada).",
    schema: z.object({}),
    jsonSchema: obj({}),
    externalData: true,
    run: ({ store }) => store.listCalendar(new Date().toISOString().slice(0, 10)),
  },
  {
    name: "programar_publicacion",
    description:
      "Publicación: reserva una pieza en el calendario y crea su propuesta de publicación. El sistema aplica el máximo diario de publicaciones por plataforma, " +
      "revisa el texto y decide según la autonomía; nada se publica sin pasar por ahí. Si la pieza lleva IA, el texto debe etiquetarlo.",
    schema: z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), platform: z.enum(["tiktok", "instagram"]), creative: z.string().regex(/^CRE-\d{4}$/),
      title: z.string().min(3).max(140), caption: z.string().min(5).max(2200), ai_labelled: z.boolean(),
    }),
    jsonSchema: obj({
      day: { type: "string", description: "AAAA-MM-DD, hoy o después" }, platform: { type: "string", enum: ["tiktok", "instagram"] },
      creative: { type: "string" }, title: { type: "string" }, caption: { type: "string", description: "Texto del post con hashtags" },
      ai_labelled: { type: "boolean", description: "true si el texto o la etiqueta de la plataforma indica contenido generado con IA" },
    }, ["day", "platform", "creative", "title", "caption", "ai_labelled"]),
    run: async (ctx, i) => {
      const { store, demo } = ctx;
      if (i.day < new Date().toISOString().slice(0, 10)) throw new Error("No se puede programar en el pasado");
      const creative = (await store.listCreatives()).find((c) => c.code === i.creative);
      if (!creative) throw new Error("Creatividad no encontrada");
      const max = (await store.getGuardrails()).organic_posts_day_max ?? 0;
      const sameDay = (await store.listCalendar(i.day)).filter((c) => c.day === i.day && c.platform === i.platform).length;
      if (sameDay >= max) throw new Error(`Ya hay ${sameDay} publicaciones en ${i.platform} el ${i.day} (máximo ${max})`);
      const entry = await store.schedule({ day: i.day, platform: i.platform, title: i.title, caption: i.caption, creativeCode: i.creative, ejemplo: Boolean(demo) });
      const p = await propose(store, {
        agent: ctx.agent, runId: ctx.runId, taskId: ctx.taskId, actionType: "publicar_contenido", title: `${i.platform} ${i.day}: ${i.title}`,
        reason: `Programado en el calendario para el ${i.day} con la creatividad ${i.creative}`,
        payload: { calendar_id: entry, platform: i.platform, day: i.day, creative: i.creative, text: i.caption, contains_ai: creative.contains_ai, ai_labelled: i.ai_labelled },
        idempotencyKey: `publicar:${entry}`,
      });
      await store.linkCalendarProposal(entry, p.id);
      return { calendario: entry, propuesta: p };
    },
  },
  {
    name: "metricas_anuncios",
    description: "Métricas importadas de anuncios por anuncio (últimos N días): impresiones, clics, gasto, compras, ingresos, CTR, CPA, ROAS y veredicto de las reglas.",
    schema: z.object({ days: z.number().int().min(1).max(60).default(14) }),
    jsonSchema: obj({ days: { type: "integer", description: "Ventana en días (1-60), por defecto 14" } }),
    externalData: true,
    run: async ({ store }, i) => {
      const rules = await store.decisionRules();
      return (await store.adRows(i.days)).map((a) => reviewAd(a, rules));
    },
  },
  {
    name: "proponer_pausa",
    description:
      "Anuncios: propone pausar un anuncio. Solo se acepta si las reglas lo justifican (CTR bajo con datos suficientes, tope de test sin ventas o CPA muy por encima del equilibrio). " +
      "Un anuncio que cumple los criterios no se pausa.",
    schema: z.object({ platform: z.string(), campaign: z.string(), ad: z.string(), days: z.number().int().min(1).max(60).default(14) }),
    jsonSchema: obj({ platform: { type: "string" }, campaign: { type: "string" }, ad: { type: "string" }, days: { type: "integer" } }, ["platform", "campaign", "ad"]),
    run: async (ctx, i) => {
      const rules = await ctx.store.decisionRules();
      const row = (await ctx.store.adRows(i.days)).find((a) => adKey(a) === adKey(i));
      if (!row) throw new Error("Anuncio no encontrado en las métricas importadas");
      const r = reviewAd(row, rules);
      if (r.verdict !== "pausar") throw new Error(`No se pausa: ${r.reasons.join(" ")}`);
      return propose(ctx.store, {
        agent: ctx.agent, runId: ctx.runId, taskId: ctx.taskId, actionType: "pausar_anuncio",
        title: `Pausar ${i.platform} · ${i.campaign} · ${i.ad || "(sin nombre)"}`, reason: r.reasons.join(" · "),
        payload: { platform: i.platform, campaign: i.campaign, ad: i.ad, product: r.product },
        metrics: { impressions: r.impressions, clicks: r.clicks, spend_cents: r.spend_cents, purchases: r.purchases, ctr: r.ctr, cpa_cents: r.cpa_cents, roas: r.roas },
        idempotencyKey: `pausar:${adKey(i)}:${new Date().toISOString().slice(0, 10)}`,
      });
    },
  },
  {
    name: "proponer_presupuesto",
    description:
      "Anuncios: propone lanzar un test o cambiar el presupuesto diario de una campaña (céntimos). El sistema comprueba los topes diario, semanal, mensual y por producto " +
      "y la subida máxima sin aprobación; lo que los supere se bloquea.",
    schema: z.object({
      campaign: z.string().min(2).max(140), product: z.string().regex(/^PRD-\d{4}$/), daily_cents: z.number().int().min(100).max(1_000_000),
      current_daily_cents: z.number().int().min(0).default(0), reason: z.string().min(10).max(1000), margin_pct: z.number().optional(),
    }),
    jsonSchema: obj({
      campaign: { type: "string" }, product: { type: "string" }, daily_cents: { type: "integer" },
      current_daily_cents: { type: "integer", description: "0 si es una campaña nueva" }, reason: { type: "string" }, margin_pct: { type: "number" },
    }, ["campaign", "product", "daily_cents", "reason"]),
    run: (ctx, i) => {
      const increase = i.current_daily_cents > 0 ? Math.round(((i.daily_cents - i.current_daily_cents) / i.current_daily_cents) * 1000) / 10 : 0;
      return propose(ctx.store, {
        agent: ctx.agent, runId: ctx.runId, taskId: ctx.taskId, actionType: "presupuesto_anuncios",
        title: `${i.current_daily_cents ? "Presupuesto" : "Lanzar test"} ${i.campaign}: ${(i.daily_cents / 100).toFixed(2)} €/día`, reason: i.reason,
        payload: { campaign: i.campaign, product: i.product, amount_cents: i.daily_cents, increase_pct: increase, ...(i.margin_pct != null ? { margin_pct: i.margin_pct } : {}) },
        idempotencyKey: `presupuesto:${i.campaign}:${i.daily_cents}:${new Date().toISOString().slice(0, 10)}`,
      });
    },
  },
  {
    name: "motor_decision",
    description: "Analista: recalcula el motor de decisión (escalar / arreglar / matar / esperar) de los productos en test con las métricas importadas. Las recomendaciones quedan en Decisiones para Jaska.",
    schema: z.object({}),
    jsonSchema: obj({}),
    run: ({ store }) => store.runDecisions(),
  },
];

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);
export const toolDefs = (names: string[]): Tool[] =>
  TOOLS.filter((t) => names.includes(t.name)).map((t) => ({ name: t.name, description: t.description, input_schema: t.jsonSchema }));
