// Autonomy engine. Pure module: given an action an agent wants to take, the autonomy level,
// the hard limits (guardrails) and the system state, decide what happens. The agent never decides this.
//
//   N0 observar  → the agent may only analyse; any action is blocked
//   N1 preparar  → stored as a draft; approving it accepts the draft but runs nothing external
//   N2 aprobar   → ready to run; it runs when a human approves it
//   N3 límites   → runs by itself if every hard limit holds (otherwise falls back to N2)
//
// On top: kill switch (blocks external actions), dry-run (external actions are simulated),
// actions that always need a human (N2 max) and actions agents can never take.

export type Decision = "ejecutar" | "aprobacion" | "borrador" | "simular" | "bloquear";
export type Risk = "bajo" | "medio" | "alto";

export interface ActionType {
  key: string;
  label: string;
  risk: Risk;
  external: boolean;      // touches the outside world (money, publication, messages)
  alwaysHuman?: boolean;  // never above N2
  agentsForbidden?: boolean; // only people can do it, from the panel
}

export const ACTION_TYPES: ActionType[] = [
  { key: "crear_borrador_producto", label: "Crear borrador de producto en la tienda", risk: "bajo", external: false },
  { key: "publicar_producto", label: "Publicar un producto en la tienda", risk: "alto", external: true },
  { key: "cambiar_precio", label: "Cambiar el precio de un producto publicado", risk: "medio", external: true },
  { key: "pedido_muestra", label: "Pedir una muestra a un proveedor", risk: "alto", external: true },
  { key: "pedido_proveedor", label: "Enviar un pedido de cliente al proveedor", risk: "alto", external: true },
  { key: "publicar_contenido", label: "Publicar contenido orgánico en redes", risk: "medio", external: true },
  { key: "presupuesto_anuncios", label: "Lanzar o subir presupuesto de anuncios", risk: "alto", external: true },
  { key: "pausar_anuncio", label: "Pausar o bajar el gasto de un anuncio", risk: "bajo", external: true },
  { key: "responder_cliente", label: "Responder a un cliente", risk: "medio", external: true },
  { key: "reembolso", label: "Conceder un reembolso o descuento", risk: "alto", external: true },
  { key: "mensaje_nuevo_contacto", label: "Primer mensaje a un creador o proveedor nuevo", risk: "alto", external: true, alwaysHuman: true },
  { key: "contrato", label: "Contrato con proveedor o creador", risk: "alto", external: true, alwaysHuman: true },
  { key: "aceptar_terminos", label: "Aceptar términos de una plataforma", risk: "alto", external: true, alwaysHuman: true },
  { key: "pagos_banco", label: "Alta o cambio de métodos de pago o datos bancarios", risk: "alto", external: true, alwaysHuman: true },
  { key: "fiscal", label: "Acción fiscal o de facturación oficial", risk: "alto", external: true, alwaysHuman: true },
  { key: "datos_empresa", label: "Cambio de forma jurídica o datos de la empresa", risk: "alto", external: true, alwaysHuman: true },
  { key: "borrar_datos_cliente", label: "Eliminar datos de clientes", risk: "alto", external: true, alwaysHuman: true },
  { key: "cambiar_limites", label: "Cambiar límites o niveles de autonomía", risk: "alto", external: false, agentsForbidden: true },
];

export const actionType = (key: string) => ACTION_TYPES.find((a) => a.key === key);

export type Guardrails = Record<string, number>;

/** What has already been used in the current windows (filled from the database). */
export interface Usage {
  adsToday: number; adsWeek: number; adsMonth: number; adsProduct: number;
  samplesWeek: number; supplierToday: number; postsToday: number; publishedWeek: number; inTest: number;
}
export const EMPTY_USAGE: Usage = { adsToday: 0, adsWeek: 0, adsMonth: 0, adsProduct: 0, samplesWeek: 0, supplierToday: 0, postsToday: 0, publishedWeek: 0, inTest: 0 };

/** Numbers an agent attaches to a proposal (all optional; amounts in cents). */
export interface ActionPayload {
  amount_cents?: number;
  margin_pct?: number;          // contribution margin of the product, %
  old_price_cents?: number;
  new_price_cents?: number;
  increase_pct?: number;        // budget increase vs current, %
  economic_commitment?: boolean; // a customer reply that promises money
  [k: string]: unknown;
}

export interface EvaluateInput {
  actionType: string;
  level: number;
  payload: ActionPayload;
  guardrails: Guardrails;
  state: { killSwitch: boolean; dryRun: boolean };
  usage?: Usage;
}

export interface Evaluation {
  decision: Decision;
  reasons: string[];
  effectiveLevel: number;
}

const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

/** Hard-limit violations: if any, the action is blocked (only the owner can change limits). */
export function limitViolations(type: string, p: ActionPayload, g: Guardrails, u: Usage = EMPTY_USAGE): string[] {
  const v: string[] = [];
  const amount = Math.max(0, Number(p.amount_cents ?? 0));
  const over = (used: number, key: string, label: string) => {
    const limit = g[key] ?? 0;
    if (used + amount > limit) v.push(`${label}: ${eur(used + amount)} supera el límite de ${eur(limit)}`);
  };
  switch (type) {
    case "presupuesto_anuncios":
      over(u.adsToday, "ads_daily_max", "Gasto diario en anuncios");
      over(u.adsWeek, "ads_weekly_max", "Gasto semanal en anuncios");
      over(u.adsMonth, "ads_monthly_max", "Gasto mensual en anuncios");
      over(u.adsProduct, "ads_product_max", "Gasto en anuncios del producto");
      break;
    case "pedido_muestra":
      over(u.samplesWeek, "samples_weekly_max", "Gasto semanal en muestras");
      break;
    case "pedido_proveedor":
      over(u.supplierToday, "supplier_daily_max", "Gasto diario en pedidos a proveedor");
      break;
    case "reembolso":
      // Above the limit a refund is not blocked but needs a human (see softLimits).
      break;
    case "publicar_producto":
      if (p.margin_pct == null) v.push("Falta el margen de contribución calculado");
      else if (p.margin_pct < (g.min_margin_pct ?? 0)) v.push(`Margen ${p.margin_pct} % por debajo del mínimo ${g.min_margin_pct} %`);
      if (u.publishedWeek + 1 > (g.products_published_week_max ?? 0)) v.push(`Ya se han publicado ${u.publishedWeek} productos esta semana (máx. ${g.products_published_week_max})`);
      break;
    case "cambiar_precio": {
      if (p.old_price_cents && p.new_price_cents) {
        const pct = Math.abs(p.new_price_cents - p.old_price_cents) / p.old_price_cents * 100;
        if (pct > (g.price_change_daily_max_pct ?? 0)) v.push(`Cambio de precio del ${pct.toFixed(1)} % supera el máximo diario del ${g.price_change_daily_max_pct} %`);
      } else v.push("Faltan el precio actual y el nuevo");
      if (p.margin_pct != null && p.margin_pct < (g.min_margin_pct ?? 0)) v.push(`Con el nuevo precio el margen (${p.margin_pct} %) queda por debajo del mínimo`);
      break;
    }
    case "publicar_contenido":
      if (u.postsToday + 1 > (g.organic_posts_day_max ?? 0)) v.push(`Máximo de ${g.organic_posts_day_max} publicaciones al día alcanzado`);
      break;
  }
  return v;
}

/** Conditions that don't block but force a human approval even at N3. */
export function softLimits(type: string, p: ActionPayload, g: Guardrails): string[] {
  const s: string[] = [];
  if (type === "presupuesto_anuncios" && (p.increase_pct ?? 0) > (g.ads_increase_max_pct ?? 0)) {
    s.push(`Subida de presupuesto del ${p.increase_pct} % (más del ${g.ads_increase_max_pct} % requiere aprobación)`);
  }
  if (type === "reembolso" && Number(p.amount_cents ?? 0) > (g.refund_no_approval_max ?? 0)) {
    s.push(`Reembolso de ${eur(Number(p.amount_cents))} por encima del límite sin aprobación`);
  }
  if (type === "responder_cliente" && p.economic_commitment) s.push("La respuesta implica un compromiso económico");
  return s;
}

export function evaluateAction(i: EvaluateInput): Evaluation {
  const t = actionType(i.actionType);
  if (!t) return { decision: "bloquear", reasons: [`Tipo de acción desconocido: ${i.actionType}`], effectiveLevel: 0 };
  if (t.agentsForbidden) return { decision: "bloquear", reasons: [`«${t.label}» solo puede hacerlo una persona desde el panel`], effectiveLevel: 0 };
  if (i.state.killSwitch && t.external) return { decision: "bloquear", reasons: ["Parada global activa"], effectiveLevel: 0 };

  const hard = limitViolations(t.key, i.payload, i.guardrails, i.usage);
  if (hard.length) return { decision: "bloquear", reasons: hard, effectiveLevel: 0 };
  if (i.level <= 0) return { decision: "bloquear", reasons: ["Nivel N0: el agente solo puede observar y recomendar"], effectiveLevel: 0 };

  const reasons: string[] = [];
  let level = Math.min(3, i.level);
  if (t.alwaysHuman && level > 2) { level = 2; reasons.push("Siempre requiere aprobación humana"); }
  const soft = softLimits(t.key, i.payload, i.guardrails);
  if (soft.length && level > 2) { level = 2; reasons.push(...soft); }

  if (level === 1) return { decision: "borrador", reasons: [...reasons, "Nivel N1: se prepara como borrador"], effectiveLevel: 1 };
  if (level === 2) return { decision: "aprobacion", reasons: [...reasons, "Nivel N2: se ejecuta al aprobarla"], effectiveLevel: 2 };
  if (t.external && i.state.dryRun) return { decision: "simular", reasons: [...reasons, "Modo simulación: no se ejecuta de verdad"], effectiveLevel: 3 };
  return { decision: "ejecutar", reasons: [...reasons, "Nivel N3 dentro de límites"], effectiveLevel: 3 };
}

/** Recommend promoting an action type when it has enough clean approvals. Only the owner promotes. */
export function promotionAdvice(p: { level: number; approved: number; rejected: number }, minApproved: number) {
  if (p.level >= 3) return null;
  if (p.approved >= minApproved && p.rejected <= Math.floor(p.approved * 0.1)) {
    return `Recomendado subir a N${p.level + 1}: ${p.approved} aprobadas y ${p.rejected} rechazadas`;
  }
  return null;
}
