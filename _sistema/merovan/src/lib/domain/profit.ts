// Real profit per product and channel, from actual orders. Pure module; amounts in cents.
// Everything is computed WITHOUT VAT: VAT collected is a debt with the tax office, not income.
//
//   real profit = net sales − refunds − cost of goods − platform fees − payment fees
//                 − return costs − chargeback losses − ad spend
//
// Order-level amounts (shipping charged, fees) are allocated to products by their share of the order.

export interface ProfitOrder {
  id: string;
  channel: string;
  status: string;                // pagado, enviado, entregado, reembolsado…
  shippingCents: number;         // charged to the customer, VAT included
  platformFeeCents: number;      // marketplace commission (TikTok Shop)
  paymentFeeCents: number;       // Stripe or similar
  items: {
    productId: string;
    quantity: number;
    unitPriceCents: number;      // VAT included
    vatRate: number;
    unitCostCents: number | null;   // product + supplier shipping, snapshot at checkout
  }[];
  supplierCostCents: number | null; // actual amount paid to the supplier (overrides the snapshot)
  refundCents: number;           // amount refunded to the customer, VAT included
  returnCostCents: number;       // our cost of the return (shipping back, lost product…), no VAT
  chargebackLossCents: number;   // lost disputes: amount + fee
}

export interface ProfitLine {
  key: string;
  orders: number;
  units: number;
  netSalesCents: number;
  refundsCents: number;
  cogsCents: number;
  platformFeesCents: number;
  paymentFeesCents: number;
  returnCostsCents: number;
  chargebacksCents: number;
  adSpendCents: number;
  profitCents: number;
  marginPct: number | null;      // profit / net sales after refunds
}

const COUNTED = new Set(["pagado", "enviado_proveedor", "enviado", "entregado", "reembolsado"]);
const net = (gross: number, vat: number) => gross / (1 + vat);

function empty(key: string): ProfitLine {
  return { key, orders: 0, units: 0, netSalesCents: 0, refundsCents: 0, cogsCents: 0, platformFeesCents: 0,
    paymentFeesCents: 0, returnCostsCents: 0, chargebacksCents: 0, adSpendCents: 0, profitCents: 0, marginPct: null };
}

function finish(l: ProfitLine): ProfitLine {
  const r = (n: number) => Math.round(n);
  const out = {
    ...l,
    netSalesCents: r(l.netSalesCents), refundsCents: r(l.refundsCents), cogsCents: r(l.cogsCents),
    platformFeesCents: r(l.platformFeesCents), paymentFeesCents: r(l.paymentFeesCents),
    returnCostsCents: r(l.returnCostsCents), chargebacksCents: r(l.chargebacksCents), adSpendCents: r(l.adSpendCents),
  };
  out.profitCents = out.netSalesCents - out.refundsCents - out.cogsCents - out.platformFeesCents - out.paymentFeesCents
    - out.returnCostsCents - out.chargebacksCents - out.adSpendCents;
  const base = out.netSalesCents - out.refundsCents;
  out.marginPct = base > 0 ? Math.round((out.profitCents / base) * 10000) / 10000 : null;
  return out;
}

/** Profit grouped by `by` ("product" or "channel"). Ad spend is keyed by product id. */
export function realProfit(orders: ProfitOrder[], adSpendByProduct: Record<string, number>, by: "product" | "channel") {
  const lines = new Map<string, ProfitLine>();
  const line = (k: string) => lines.get(k) ?? lines.set(k, empty(k)).get(k)!;

  for (const o of orders.filter((x) => COUNTED.has(x.status))) {
    const gross = o.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
    if (gross <= 0) continue;
    const snapshotCost = o.items.reduce((s, i) => s + (i.unitCostCents ?? 0) * i.quantity, 0);
    const avgVat = o.items.reduce((s, i) => s + i.vatRate * i.unitPriceCents * i.quantity, 0) / gross;
    const seen = new Set<string>();

    for (const i of o.items) {
      const share = (i.unitPriceCents * i.quantity) / gross;
      const itemCostShare = snapshotCost > 0 ? ((i.unitCostCents ?? 0) * i.quantity) / snapshotCost : share;
      const l = line(by === "product" ? i.productId : o.channel);
      if (!seen.has(l.key)) { l.orders += 1; seen.add(l.key); }
      l.units += i.quantity;
      l.netSalesCents += net(i.unitPriceCents * i.quantity, i.vatRate) + net(o.shippingCents, avgVat) * share;
      l.refundsCents += net(o.refundCents, avgVat) * share;
      l.cogsCents += o.supplierCostCents != null ? o.supplierCostCents * itemCostShare : (i.unitCostCents ?? 0) * i.quantity;
      l.platformFeesCents += o.platformFeeCents * share;
      l.paymentFeesCents += o.paymentFeeCents * share;
      l.returnCostsCents += o.returnCostCents * share;
      l.chargebacksCents += o.chargebackLossCents * share;
    }
  }
  if (by === "product") {
    for (const [productId, spend] of Object.entries(adSpendByProduct)) line(productId).adSpendCents += spend;
  } else {
    const total = Object.values(adSpendByProduct).reduce((s, x) => s + x, 0);
    if (total) line("anuncios").adSpendCents += total; // ads are not tied to one channel
  }
  return [...lines.values()].map(finish).sort((a, b) => b.profitCents - a.profitCents);
}

/** VAT collected per destination country and month (for the gestoría; OSS when outside Spain). */
export function vatSummary(orders: (ProfitOrder & { country: string; paidAt: string })[]) {
  const rows = new Map<string, { country: string; month: string; baseCents: number; vatCents: number; refundVatCents: number }>();
  for (const o of orders.filter((x) => COUNTED.has(x.status))) {
    const month = o.paidAt.slice(0, 7);
    const k = `${o.country}|${month}`;
    const r = rows.get(k) ?? { country: o.country, month, baseCents: 0, vatCents: 0, refundVatCents: 0 };
    const gross = o.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0) + o.shippingCents;
    const avgVat = o.items.length ? o.items.reduce((s, i) => s + i.vatRate, 0) / o.items.length : 0.21;
    r.baseCents += net(gross, avgVat);
    r.vatCents += gross - net(gross, avgVat);
    r.refundVatCents += o.refundCents - net(o.refundCents, avgVat);
    rows.set(k, r);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, baseCents: Math.round(r.baseCents), vatCents: Math.round(r.vatCents), refundVatCents: Math.round(r.refundVatCents) }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.country.localeCompare(b.country));
}
