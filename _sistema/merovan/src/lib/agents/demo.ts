// Scripted runs used while there is no AI key: they exercise the real tools and database so the
// whole chain can be tested end to end. Every row they create is marked demo and labelled "(ejemplo)".
import { type ModelRequest, ScriptedModel as Scripted, callTool, say } from "./model";

// Demo runs cost nothing: they report zero tokens so they never eat into the AI budget.
class ScriptedModel extends Scripted {
  constructor(script: ConstructorParameters<typeof Scripted>[0]) { super(script, { input: 0, output: 0 }); }
}

/** JSON outputs of the tool results in the last user message. */
function lastResults(req: ModelRequest): unknown[] {
  const last = req.messages[req.messages.length - 1];
  if (!Array.isArray(last?.content)) return [];
  return last.content.flatMap((b) => {
    if (b.type !== "tool_result" || b.is_error || typeof b.content !== "string") return [];
    const json = b.content.replace(/^<datos_externos>\n/, "").replace(/\n<\/datos_externos>[\s\S]*$/, "");
    try { return [JSON.parse(json)]; } catch { return []; }
  });
}

const S = (demanda: number, visual: number, problema: number, margen: number, competencia: number, logistica: number, riesgo_legal: number, recompra: number) =>
  ({ demanda, visual, problema, margen, competencia, logistica, riesgo_legal, recompra });

const NICHES = [
  {
    niche: { name: "Orden en casas pequeñas (ejemplo)", thesis: "Pisos pequeños en ciudad: soluciones de almacenaje que se entienden en un vídeo de 10 segundos.", audience: "25-40 años, alquiler en ciudad", evidence: ["Hipótesis sin verificar: datos de ejemplo de la prueba sin IA"], risks: ["Competencia alta en marketplaces"], confidence: "baja" },
    candidates: [
      { name: "Organizador extensible bajo fregadero (ejemplo)", description: "Estantería de dos alturas que se adapta a las tuberías.", scores: S(4, 5, 4, 4, 3, 3, 5, 3) },
      { name: "Cajas plegables con ventana (ejemplo)", description: "Pack de cajas de tela con frontal transparente.", scores: S(3, 3, 3, 3, 2, 4, 5, 4) },
    ],
  },
  {
    niche: { name: "Escritorio y teletrabajo (ejemplo)", thesis: "Mejoras baratas de ergonomía y orden para quien trabaja en casa.", audience: "Teletrabajadores y estudiantes", evidence: ["Hipótesis sin verificar: datos de ejemplo de la prueba sin IA"], risks: ["Productos electrónicos requieren CE"], confidence: "baja" },
    candidates: [
      { name: "Bandeja pasacables bajo mesa (ejemplo)", description: "Canaleta metálica atornillable para ocultar cables.", scores: S(4, 4, 4, 4, 3, 4, 5, 2) },
      { name: "Elevador de portátil plegable (ejemplo)", description: "Soporte de aluminio con seis alturas.", scores: S(4, 4, 3, 3, 2, 4, 5, 2) },
    ],
  },
  {
    niche: { name: "Mascotas en piso (ejemplo)", thesis: "Accesorios que resuelven molestias diarias de perros y gatos en casa.", audience: "Dueños de mascotas en ciudad", evidence: ["Hipótesis sin verificar: datos de ejemplo de la prueba sin IA"], risks: ["Evitar cualquier claim veterinario"], confidence: "baja" },
    candidates: [
      { name: "Alfombrilla lamedora con ventosas (ejemplo)", description: "Alfombrilla de silicona para ralentizar la comida.", scores: S(4, 5, 4, 4, 3, 5, 4, 3) },
      { name: "Rodillo quitapelos reutilizable (ejemplo)", description: "Rodillo sin recambios para sofás y ropa.", scores: S(4, 5, 4, 4, 2, 5, 5, 2) },
    ],
  },
];

// Example offers by candidate position: one EU warehouse, one cheaper non-EU option.
const offersFor = (i: number) => [
  { supplier: "Mayorista UE (ejemplo)", warehouse_country: "ES", unit_cost_cents: 420 + i * 90, shipping_cents: 390, promised_days: 3, source: "ejemplo" },
  { supplier: "Proveedor almacén DE (ejemplo)", warehouse_country: "DE", unit_cost_cents: 380 + i * 90, shipping_cents: 490, promised_days: 5, source: "ejemplo" },
  { supplier: "Fábrica CN (ejemplo)", warehouse_country: "CN", unit_cost_cents: 210 + i * 60, shipping_cents: 350, promised_days: 14, source: "ejemplo" },
];

type Row = { id: string; name: string; passes?: boolean; landed_cents?: number | null; price_cents?: number | null };
const candidatesOf = (req: ModelRequest) =>
  (lastResults(req)[0] as { candidates: Row[] }[] | undefined ?? []).flatMap((n) => n.candidates);

export function demoModel(agent: string) {
  switch (agent) {
    case "investigador":
      return new ScriptedModel([
        () => ({ content: NICHES.map((n) => callTool("registrar_nicho", n.niche)) }),
        (req) => ({
          content: lastResults(req).flatMap((r, i) =>
            NICHES[i].candidates.map((c) => callTool("guardar_candidato", { niche_id: (r as { niche_id: string }).niche_id, ...c }))),
        }),
        () => ({ content: [say("Prueba sin IA: registrados 3 nichos de ejemplo con 2 candidatos cada uno. Son datos ficticios para probar el circuito; con la clave de IA el Investigador hará el estudio real.")] }),
      ]);
    case "proveedores":
      return new ScriptedModel([
        () => ({ content: [callTool("ver_investigacion", {})] }),
        (req) => {
          const todo = candidatesOf(req).filter((c) => c.passes && !c.landed_cents);
          return { content: todo.length ? todo.map((c, i) => callTool("guardar_plan_proveedor", { candidate_id: c.id, offers: offersFor(i % 4) })) : [say("No hay candidatos que pasen el umbral sin plan de proveedor.")] };
        },
        () => ({ content: [say("Prueba sin IA: planes de proveedor guardados con ofertas de ejemplo (principal con almacén en España, respaldo en Alemania). No son cifras reales.")] }),
      ]);
    case "precios":
      return new ScriptedModel([
        () => ({ content: [callTool("ver_investigacion", {})] }),
        (req) => {
          const todo = candidatesOf(req).filter((c) => c.landed_cents && !c.price_cents);
          return { content: todo.length ? todo.map((c) => callTool("guardar_precio", { candidate_id: c.id })) : [say("No hay candidatos con plan de proveedor pendientes de precio.")] };
        },
        () => ({ content: [say("Prueba sin IA: precios calculados por el sistema con el margen mínimo de Límites. Margen no verificado: las cifras de proveedor son de ejemplo.")] }),
      ]);
    case "contenido": {
      const scripts = [
        { angle: "problema", hook: "(ejemplo) ¿Cables por el suelo otra vez?", problem: "Cables enredados bajo la mesa", demo: "Montaje en 5 minutos y antes/después de la mesa", proof: "Demostración en plano continuo", offer: "Envío desde España", cta: "Míralo en la tienda" },
        { angle: "demostracion", hook: "(ejemplo) Así queda mi escritorio en 30 segundos", problem: "Escritorio desordenado", demo: "Timelapse colocando la bandeja", proof: "Demostración real del producto", offer: "Envío desde España", cta: "Enlace en el perfil" },
      ];
      return new ScriptedModel([
        () => ({ content: [callTool("listar_productos", {})] }),
        (req) => {
          const product = ((lastResults(req)[0] ?? []) as { code: string }[])[0];
          return { content: product ? scripts.map((sc) => callTool("crear_guion", { code: product.code, ...sc, contains_ai: false })) : [say("No hay productos para crear contenido.")] };
        },
        (req) => {
          const codes = (lastResults(req) as { guion: string }[]).map((r) => r.guion);
          const product = ((lastResults({ ...req, messages: req.messages.slice(0, -2) })[0] ?? []) as { code: string }[])[0];
          return { content: product ? codes.map((g, i) => callTool("crear_creatividad", { code: product.code, script: g, hook: scripts[i].hook, angle: scripts[i].angle, platforms: ["tiktok", "meta"], contains_ai: false })) : [say("fin")] };
        },
        () => ({ content: [say("Prueba sin IA: 2 guiones y 2 creatividades de ejemplo en el banco. Con la clave de IA el agente creará 5-10 piezas por producto.")] }),
      ]);
    }
    case "publicacion": {
      const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      return new ScriptedModel([
        () => ({ content: [callTool("banco_creatividades", {})] }),
        (req) => {
          const demoPieces = ((lastResults(req)[0] ?? []) as { code: string; hook: string }[]).filter((c) => c.hook.startsWith("(ejemplo)")).slice(0, 2);
          return {
            content: demoPieces.length
              ? demoPieces.map((c, i) => callTool("programar_publicacion", { day: day(i + 1), platform: "tiktok", creative: c.code, title: c.hook, caption: `${c.hook.replace("(ejemplo) ", "")} #orden #escritorio #hogar`, ai_labelled: false }))
              : [say("No hay piezas de ejemplo en el banco: ejecuta antes el agente de Contenido.")],
          };
        },
        () => ({ content: [say("Prueba sin IA: 2 publicaciones de ejemplo en el calendario de los próximos días, cada una con su propuesta en la Bandeja. Nada se publica sin aprobación.")] }),
      ]);
    }
    case "anuncios":
      return new ScriptedModel([
        () => ({ content: [callTool("estado_sistema", {}), callTool("metricas_anuncios", { days: 14 })] }),
        (req) => {
          const ads = (lastResults(req)[1] ?? []) as { platform: string; campaign: string; ad: string; verdict: string }[];
          const toPause = ads.filter((a) => a.verdict === "pausar");
          return {
            content: toPause.length
              ? toPause.map((a) => callTool("proponer_pausa", { platform: a.platform, campaign: a.campaign, ad: a.ad }))
              : [say(`Prueba sin IA: ${ads.length} anuncios con métricas importadas; ninguno incumple los criterios de pausa.${ads.length ? "" : " Importa un informe en Marketing → Importar para probar."}`)],
          };
        },
        () => ({ content: [say("Prueba sin IA: propuestas de pausa creadas solo para los anuncios que incumplen las reglas. Revisa la Bandeja.")] }),
      ]);
    case "analista":
      return new ScriptedModel([
        () => ({ content: [callTool("motor_decision", {})] }),
        (req) => {
          const r = (lastResults(req)[0] ?? []) as { code: string; decision: string }[];
          return { content: [say(`Prueba sin IA: motor de decisión recalculado. ${r.length ? r.map((x) => `${x.code}: ${x.decision}`).join(" · ") : "No hay productos en test con datos."} Detalle en Decisiones.`)] };
        },
      ]);
    case "operaciones":
      return new ScriptedModel([
        () => ({ content: [callTool("estado_operaciones", {})] }),
        (req) => {
          const o = (lastResults(req)[0] ?? {}) as { sin_pedido_proveedor?: { number: number }[]; devoluciones?: { id: string; status: string }[]; retrasados?: unknown[]; tickets_abiertos?: unknown[] };
          const calls = [
            ...(o.sin_pedido_proveedor ?? []).slice(0, 3).map((x) => callTool("proponer_pedido_proveedor", { order: x.number })),
            ...(o.devoluciones ?? []).filter((d) => d.status === "recibida").slice(0, 3).map((d) => callTool("proponer_reembolso", { return_id: d.id, reason: "Devolución recibida en buen estado dentro de plazo" })),
          ];
          const summary = `Prueba sin IA: ${o.sin_pedido_proveedor?.length ?? 0} pedidos sin enviar al proveedor, ${o.retrasados?.length ?? 0} retrasados, ${o.tickets_abiertos?.length ?? 0} tickets abiertos (las respuestas las redacta el agente con IA).`;
          return { content: calls.length ? calls : [say(summary)] };
        },
        () => ({ content: [say("Prueba sin IA: propuestas de pedido al proveedor y de reembolso creadas en la Bandeja para lo que estaba pendiente.")] }),
      ]);
    case "finanzas": {
      const from = `${new Date().toISOString().slice(0, 7)}-01`;
      const to = new Date().toISOString().slice(0, 10);
      return new ScriptedModel([
        () => ({ content: [callTool("beneficio_real", { from, to, by: "product" }), callTool("conciliacion", { from, to })] }),
        (req) => {
          const [p, c] = lastResults(req) as [{ beneficio_contribucion_cents: number; gastos_generales_cents: number; beneficio_neto_cents: number }, { pedidos_revisados: number; discrepancias: unknown[] }];
          const e = (n: number) => `${(n / 100).toFixed(2).replace(".", ",")} €`;
          return { content: [say(`Prueba sin IA (${from} a ${to}): beneficio de contribución ${e(p?.beneficio_contribucion_cents ?? 0)}, gastos generales ${e(p?.gastos_generales_cents ?? 0)}, beneficio neto ${e(p?.beneficio_neto_cents ?? 0)}. Conciliación: ${c?.pedidos_revisados ?? 0} pedidos, ${c?.discrepancias.length ?? 0} discrepancias.`)] };
        },
      ]);
    }
    case "fichas":
      // Read only: without AI it does not write texts into real products.
      return new ScriptedModel([
        () => ({ content: [callTool("listar_productos", {})] }),
        (req) => {
          const drafts = ((lastResults(req)[0] ?? []) as { code: string; publish_status: string }[]).filter((p) => p.publish_status !== "publicado").slice(0, 3);
          return { content: drafts.length ? drafts.map((p) => callTool("ver_ficha", { code: p.code })) : [say("No hay productos en borrador.")] };
        },
        (req) => {
          const lines = (lastResults(req) as { ficha: { code: string; name: string }; validacion: { ok: boolean; errors: string[] } }[])
            .map((r) => `- ${r.ficha.code} ${r.ficha.name}: ${r.validacion.ok ? "lista para proponer su publicación" : `falta: ${r.validacion.errors.join(" ")}`}`);
          return { content: [say(`Prueba sin IA: he revisado las fichas en borrador sin modificarlas.\n${lines.join("\n") || "Sin fichas que revisar."}`)] };
        },
      ]);
    default:
      return new ScriptedModel([
        () => ({ content: [callTool("estado_sistema", {}), callTool("propuestas", { status: "pendiente" })] }),
        () => ({ content: [say("Modo de prueba sin clave de IA: he leído el estado y las propuestas pendientes, pero no he razonado con Claude. Pega MEROVAN_ANTHROPIC_API_KEY en .env.local para activar a los agentes de verdad.")] }),
      ]);
  }
}
