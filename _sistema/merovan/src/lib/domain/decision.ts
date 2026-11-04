// Decision engine: ESCALAR / ARREGLAR / MATAR / ESPERAR for a product in test.
// Pure module. Every recommendation lists the rules evaluated (value vs threshold) so it can be audited.

export type Decision = "escalar" | "arreglar" | "matar" | "esperar";
export type Confidence = "baja" | "media" | "alta";

export interface DecisionRules {
  minOrdersToScale: number;      // ESCALAR needs at least this many purchases
  testWindowMinDays: number;     // before this, little data → ESPERAR (unless a kill rule fires)
  ctrGood: number;               // 0.015 = 1,5 %
  ctrBad: number;                // 0.005 = 0,5 %
  minCreativesForCtrKill: number;
  maxCreativeVariants: number;
  cpaKillMultiple: number;       // CPA > 3 × break-even CPA → MATAR
  maxReturnRate: number;         // 0.15 = 15 %
  lowImpressions: number;        // fewer impressions than this after the window → delivery problem
  minClicksForCtr: number;       // impressions needed before judging CTR
}

export const DEFAULT_RULES: DecisionRules = {
  minOrdersToScale: 10,
  testWindowMinDays: 7,
  ctrGood: 0.015,
  ctrBad: 0.005,
  minCreativesForCtrKill: 3,
  maxCreativeVariants: 20,
  cpaKillMultiple: 3,
  maxReturnRate: 0.15,
  lowImpressions: 1000,
  minClicksForCtr: 2000,
};

export interface DecisionInput {
  spendCents: number;
  impressions: number;
  clicks: number;
  addToCart: number;
  purchases: number;
  revenueCents: number;          // without VAT, same basis as break-even ROAS
  daysWithSpend: number;
  creativesTested: number;
  dailyRoas: (number | null)[];  // most recent last; used for the 3-day trend
  contributionMarginCents: number | null; // per order; null = unknown (no price/cost)
  breakEvenRoas: number | null;
  targetRoas: number | null;
  testCapCents: number | null;
  returnRate: number | null;
}

export interface RuleCheck {
  id: string;
  label: string;
  value: string;
  threshold: string;
  hit: boolean;                  // true = the rule's condition is met
}

export interface Recommendation {
  decision: Decision;
  reasons: string[];
  actions: string[];
  checks: RuleCheck[];
  confidence: Confidence;
  roas: number | null;
  cpaCents: number | null;
  ctr: number | null;
}

const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(2).replace(".", ",")} %`);
const eur = (c: number | null) => (c == null ? "—" : `${(c / 100).toFixed(2).replace(".", ",")} €`);
const x = (n: number | null) => (n == null ? "—" : n.toFixed(2).replace(".", ","));

export function confidenceFor(purchases: number, clicks: number): Confidence {
  if (purchases >= 10 && clicks >= 300) return "alta";
  if (purchases >= 3 || clicks >= 100) return "media";
  return "baja";
}

export function decide(i: DecisionInput, rules: DecisionRules = DEFAULT_RULES): Recommendation {
  const roas = i.spendCents > 0 ? i.revenueCents / i.spendCents : null;
  const cpa = i.purchases > 0 ? i.spendCents / i.purchases : null;
  const ctr = i.impressions > 0 ? i.clicks / i.impressions : null;
  const conv = i.clicks > 0 ? i.purchases / i.clicks : null;
  const cartToBuy = i.addToCart > 0 ? i.purchases / i.addToCart : null;
  const beCpa = i.contributionMarginCents != null && i.contributionMarginCents > 0 ? i.contributionMarginCents : null;
  const last3 = i.dailyRoas.slice(-3).filter((r): r is number => r != null);
  const stable = last3.length === 3 && i.breakEvenRoas != null && last3.every((r) => r >= i.breakEvenRoas!);

  const checks: RuleCheck[] = [
    { id: "margen", label: "Margen de contribución ≤ 0", value: eur(i.contributionMarginCents), threshold: "> 0 €",
      hit: i.contributionMarginCents != null && i.contributionMarginCents <= 0 },
    { id: "devoluciones", label: "Tasa de devolución alta", value: pct(i.returnRate), threshold: `≤ ${pct(rules.maxReturnRate)}`,
      hit: i.returnRate != null && i.returnRate > rules.maxReturnRate },
    { id: "tope", label: "Tope de gasto superado", value: eur(i.spendCents), threshold: `tope ${eur(i.testCapCents)}`,
      hit: i.testCapCents != null && i.spendCents >= i.testCapCents },
    { id: "cpa", label: `CPA > ${rules.cpaKillMultiple} × CPA de equilibrio`, value: cpa != null ? eur(cpa) : `${eur(i.spendCents)} sin ventas`,
      threshold: beCpa != null ? eur(beCpa * rules.cpaKillMultiple) : "—",
      hit: beCpa != null && (cpa != null ? cpa > beCpa * rules.cpaKillMultiple : i.spendCents > beCpa * rules.cpaKillMultiple) },
    { id: "ctr_bajo", label: `CTR bajo con ${rules.minCreativesForCtrKill}+ creatividades`, value: `${pct(ctr)} · ${i.creativesTested} creat.`,
      threshold: `≥ ${pct(rules.ctrBad)}`,
      hit: ctr != null && ctr < rules.ctrBad && i.creativesTested >= rules.minCreativesForCtrKill && i.impressions >= rules.minClicksForCtr },
    { id: "variantes", label: `${rules.maxCreativeVariants}+ variantes sin ángulo ganador`, value: String(i.creativesTested),
      threshold: `< ${rules.maxCreativeVariants}`,
      hit: i.creativesTested >= rules.maxCreativeVariants && (roas == null || i.breakEvenRoas == null || roas < i.breakEvenRoas) },
    { id: "roas_objetivo", label: "ROAS ≥ objetivo", value: x(roas), threshold: `≥ ${x(i.targetRoas)}`,
      hit: roas != null && i.targetRoas != null && roas >= i.targetRoas },
    { id: "pedidos", label: "Pedidos suficientes para escalar", value: String(i.purchases), threshold: `≥ ${rules.minOrdersToScale}`,
      hit: i.purchases >= rules.minOrdersToScale },
    { id: "tendencia", label: "ROAS ≥ equilibrio los últimos 3 días", value: last3.map(x).join(" · ") || "—",
      threshold: `≥ ${x(i.breakEvenRoas)}`, hit: stable },
    { id: "ventana", label: "Ventana de test cumplida", value: `${i.daysWithSpend} días`, threshold: `≥ ${rules.testWindowMinDays}`,
      hit: i.daysWithSpend >= rules.testWindowMinDays },
  ];
  const hit = (id: string) => checks.find((c) => c.id === id)!.hit;
  const base = { checks, confidence: confidenceFor(i.purchases, i.clicks), roas, cpaCents: cpa, ctr };

  // 1. Kill rules: any of them is enough.
  const kills = ["margen", "devoluciones", "cpa", "ctr_bajo", "variantes"].filter(hit);
  const scaleOk = hit("roas_objetivo") && hit("pedidos") && hit("tendencia");
  if (hit("tope") && !scaleOk) kills.unshift("tope");
  if (kills.length) {
    return {
      ...base, decision: "matar",
      reasons: kills.map((k) => checks.find((c) => c.id === k)!.label),
      actions: ["Pausar las campañas en la plataforma", "Retirar el producto de la tienda", "Pasar a «descartado» con el motivo y lo aprendido"],
    };
  }

  // 2. Scale.
  if (scaleOk) {
    return {
      ...base, decision: "escalar",
      reasons: [`ROAS ${x(roas)} ≥ objetivo ${x(i.targetRoas)} con ${i.purchases} pedidos y tendencia estable`],
      actions: ["Subir presupuesto un 20-30 % cada 2-3 días mientras aguante el ROAS",
        "Duplicar la campaña ganadora en vez de editarla", "Preparar creatividades nuevas antes de que se fatiguen",
        "Confirmar proveedor de respaldo y stock"],
    };
  }

  // 3. Not enough data yet.
  if (!hit("ventana") && confidenceFor(i.purchases, i.clicks) !== "alta") {
    return {
      ...base, decision: "esperar",
      reasons: [`Solo ${i.daysWithSpend} días con gasto y ${i.purchases} pedidos: datos insuficientes`],
      actions: ["Mantener el test sin cambios hasta cumplir la ventana o el tope de gasto"],
    };
  }

  // 4. Fix: diagnose what to change (one change at a time).
  const diagnosis: string[] = [];
  const actions: string[] = [];
  if (i.impressions < rules.lowImpressions) {
    diagnosis.push(`Pocas impresiones (${i.impressions}): problema de entrega, creatividad o segmentación`);
    actions.push("Revisar estado de los anuncios, puja y público; probar creatividades nuevas");
  }
  if (ctr != null && ctr >= rules.ctrGood && conv != null && conv < 0.01) {
    diagnosis.push(`CTR bueno (${pct(ctr)}) pero conversión baja (${pct(conv)}): el problema está en la página, la oferta o el precio`);
    actions.push("Mejorar la ficha (fotos, vídeo, confianza), revisar precio y oferta");
  }
  if (i.addToCart >= 5 && cartToBuy != null && cartToBuy < 0.3) {
    diagnosis.push(`Muchos «añadir al carrito» (${i.addToCart}) y pocas compras (${pct(cartToBuy)}): checkout, envío o confianza`);
    actions.push("Revisar gastos y plazos de envío, métodos de pago y el proceso de pago");
  }
  if (roas != null && i.breakEvenRoas != null && i.targetRoas != null && roas >= i.breakEvenRoas && roas < i.targetRoas) {
    diagnosis.push(`ROAS ${x(roas)} entre equilibrio (${x(i.breakEvenRoas)}) y objetivo (${x(i.targetRoas)})`);
    actions.push("Subir el valor del pedido (packs, upsell), subir precio o negociar coste");
  }
  if (roas != null && i.breakEvenRoas != null && roas >= i.targetRoas! && !hit("pedidos")) {
    diagnosis.push(`ROAS bueno pero solo ${i.purchases} pedidos: falta volumen para confirmarlo`);
    actions.push("Mantener presupuesto y acumular pedidos antes de escalar");
  }
  if (diagnosis.length === 0) {
    diagnosis.push(`ROAS ${x(roas)} por debajo del equilibrio ${x(i.breakEvenRoas)}`);
    actions.push("Probar nuevos ganchos y ángulos; si no mejora antes del tope, matar");
  }
  return { ...base, decision: "arreglar", reasons: diagnosis, actions: [...actions, "Hacer un solo cambio y abrir una nueva ventana de test"] };
}
