// Phase 6 numbers: reconciliation checks and the profit summary the Finance agent reports.
// Pure module. Customer personal data never reaches the agents: only order numbers and amounts.
import { type ProfitOrder, realProfit } from "@/lib/domain/profit";

export interface ReconRow {
  number: number;
  channel: string;
  status: string;
  total_cents: number;
  payment_ref: string | null;
  external_ref: string | null;
  supplier_cost_cents: number | null;
  refunded_cents: number;          // returns marked reembolsada
}

export interface Discrepancy { order: number; issue: string }

export function reconcile(rows: ReconRow[]): Discrepancy[] {
  const out: Discrepancy[] = [];
  for (const r of rows) {
    if (r.channel === "web" && r.status !== "pendiente_pago" && r.status !== "cancelado" && !r.payment_ref) out.push({ order: r.number, issue: "Pedido cobrado sin referencia de pago de Stripe" });
    if (r.channel === "tiktok_shop" && !r.external_ref) out.push({ order: r.number, issue: "Pedido de TikTok Shop sin número de pedido externo" });
    if (r.status === "reembolsado" && r.refunded_cents === 0) out.push({ order: r.number, issue: "Marcado como reembolsado pero sin devolución reembolsada registrada" });
    if (r.refunded_cents > r.total_cents) out.push({ order: r.number, issue: `Reembolsado ${(r.refunded_cents / 100).toFixed(2)} € más que el total del pedido` });
    if (["enviado", "entregado"].includes(r.status) && r.supplier_cost_cents == null) out.push({ order: r.number, issue: "Enviado sin coste real del proveedor registrado" });
  }
  return out;
}

export function profitSummary(orders: ProfitOrder[], adSpend: Record<string, number>, expensesCents: number, codes: Record<string, string>, by: "product" | "channel") {
  const lines = realProfit(orders, adSpend, by).map((l) => ({ ...l, key: by === "product" ? codes[l.key] ?? l.key : l.key }));
  const contribution = lines.reduce((s, l) => s + l.profitCents, 0);
  return { lineas: lines, beneficio_contribucion_cents: contribution, gastos_generales_cents: expensesCents, beneficio_neto_cents: contribution - expensesCents };
}
