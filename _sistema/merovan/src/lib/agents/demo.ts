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
