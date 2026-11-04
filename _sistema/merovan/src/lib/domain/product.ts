// Product research rules: scorecard, legal checklist and status transitions.
// Pure module; the database enforces the critical rules again (status guard trigger).

export const CRITERIA = [
  { key: "demanda", label: "Demanda", hint: "Volumen y tendencia estable en TikTok / Google Trends" },
  { key: "visual", label: "Efecto visual", hint: "Se entiende el beneficio en 1-2 segundos" },
  { key: "problema", label: "Problema real", hint: "Resuelve algo concreto" },
  { key: "margen", label: "Margen", hint: "Precio − todos los costes ≥ objetivo" },
  { key: "competencia", label: "Competencia", hint: "Pocos anuncios activos o poco tiempo" },
  { key: "logistica", label: "Logística", hint: "Peso, fragilidad, plazo, devoluciones" },
  { key: "riesgo_legal", label: "Riesgo legal", hint: "5 = sin riesgo · 0 = riesgo alto" },
  { key: "recompra", label: "Recompra / AOV", hint: "Accesorios, packs, upsell" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];
export type Scores = Partial<Record<CriterionKey, number>>;
export type Weights = Partial<Record<CriterionKey, number>>;

export const SCORE_THRESHOLD = 28;
export const LEGAL_MIN = 3;

/** Weighted total normalised to 0-40 (8 criteria × 5). Missing scores count as 0. */
export function scoreTotal(scores: Scores, weights: Weights = {}): number {
  let sum = 0;
  let weightSum = 0;
  for (const { key } of CRITERIA) {
    const w = weights[key] ?? 1;
    const s = Math.min(5, Math.max(0, scores[key] ?? 0));
    sum += s * w;
    weightSum += w;
  }
  return weightSum === 0 ? 0 : Math.round((sum / weightSum) * CRITERIA.length * 10) / 10;
}

export function scorePasses(scores: Scores, weights: Weights = {}) {
  const total = scoreTotal(scores, weights);
  const legal = scores.riesgo_legal ?? 0;
  const reasons: string[] = [];
  if (total < SCORE_THRESHOLD) reasons.push(`Puntuación ${total}/40 por debajo de ${SCORE_THRESHOLD}`);
  if (legal < LEGAL_MIN) reasons.push(`Riesgo legal ${legal} por debajo de ${LEGAL_MIN}`);
  return { total, passes: reasons.length === 0, reasons };
}

export const LEGAL_CHECKS = [
  { key: "ce", label: "Marcado CE (si aplica)" },
  { key: "gpsr", label: "GPSR: fabricante / responsable en la UE identificado" },
  { key: "marca", label: "No copia marcas registradas de terceros" },
  { key: "cosmetica", label: "Cosmética: notificación CPNP" },
  { key: "juguetes", label: "Juguetes: CE y normativa de seguridad" },
  { key: "electronica", label: "Electrónica: CE y RAEE" },
  { key: "salud", label: "Alimentos / suplementos: sin declaraciones de salud" },
  { key: "bateria", label: "Batería de litio: documentación de transporte" },
  { key: "plataforma", label: "Permitido en TikTok Shop / Meta" },
] as const;

export type LegalKey = (typeof LEGAL_CHECKS)[number]["key"];
export type LegalValue = "pendiente" | "ok" | "no_aplica" | "rojo";
export type LegalChecks = Partial<Record<LegalKey, LegalValue>>;

export const hasRedFlag = (checks: LegalChecks) => Object.values(checks).includes("rojo");

export const STATUSES = [
  { key: "idea", label: "Idea" },
  { key: "candidato", label: "Candidato" },
  { key: "validando_proveedor", label: "Validando proveedor" },
  { key: "muestra_pedida", label: "Muestra pedida" },
  { key: "muestra_aprobada", label: "Muestra aprobada" },
  { key: "listo_para_publicar", label: "Listo para publicar" },
  { key: "en_test", label: "En test" },
  { key: "escalando", label: "Escalando" },
  { key: "pausado", label: "Pausado" },
  { key: "descartado", label: "Descartado" },
] as const;

export type Status = (typeof STATUSES)[number]["key"];
export const statusLabel = (s: string) => STATUSES.find((x) => x.key === s)?.label ?? s;

export interface TransitionContext {
  scores: Scores;
  weights?: Weights;
  legal: LegalChecks;
  hasApprovedSample: boolean;
  sampleException: string | null;
  hasBackupSupplier: boolean;
  gpsrComplete: boolean;
  hasPrice: boolean;
}

// Statuses a product can always move to (park it or kill it).
const ALWAYS_ALLOWED: Status[] = ["idea", "candidato", "pausado", "descartado"];
const AFTER_SAMPLE: Status[] = ["listo_para_publicar", "en_test", "escalando"];

/** Returns the blocking reasons for moving a product to `to` (empty = allowed). */
export function transitionBlockers(to: Status, ctx: TransitionContext): string[] {
  if (ALWAYS_ALLOWED.includes(to)) return [];
  const reasons: string[] = [];
  if (hasRedFlag(ctx.legal)) reasons.push("Hay una bandera roja en el checklist legal: resuélvela o descarta el producto.");

  const score = scorePasses(ctx.scores, ctx.weights);
  if (!score.passes) reasons.push(...score.reasons);

  if (AFTER_SAMPLE.includes(to) && !ctx.hasApprovedSample && !ctx.sampleException?.trim()) {
    reasons.push("Falta una muestra aprobada (o una excepción justificada).");
  }
  if (AFTER_SAMPLE.includes(to)) {
    if (!ctx.gpsrComplete) reasons.push("Faltan datos GPSR (fabricante, dirección y contacto).");
    if (!ctx.hasPrice) reasons.push("Falta el precio de venta.");
  }
  if (to === "escalando" && !ctx.hasBackupSupplier) reasons.push("Falta un proveedor de respaldo.");
  return reasons;
}
