import { describe, expect, it } from "vitest";
import { type ProfitOrder, realProfit, vatSummary } from "@/lib/domain/profit";

// Manual case (all checked by hand):
// 3 web orders of PRD-0001 at 19,95 € (VAT 21 %), free shipping, cost snapshot 7,40 €/unit,
// Stripe fee 1,4 % + 0,25 € = 0,53 € per order. Order C is refunded in full and the return cost us 3,00 €.
// Ad spend for the product: 20,00 €.
const order = (id: string, extra: Partial<ProfitOrder> = {}): ProfitOrder => ({
  id, channel: "web", status: "entregado", shippingCents: 0, platformFeeCents: 0, paymentFeeCents: 53,
  items: [{ productId: "P1", quantity: 1, unitPriceCents: 1995, vatRate: 0.21, unitCostCents: 740 }],
  supplierCostCents: null, refundCents: 0, returnCostCents: 0, chargebackLossCents: 0, ...extra,
});
const orders = [order("A"), order("B"), order("C", { status: "reembolsado", refundCents: 1995, returnCostCents: 300 })];

describe("real profit", () => {
  it("matches the manual calculation for a product with one return", () => {
    const [p] = realProfit(orders, { P1: 2000 }, "product");
    // Net sales: 3 × 19,95 / 1,21 = 3 × 16,4876 = 49,46 €
    expect(p.netSalesCents).toBe(4946);
    // Refund without VAT: 16,49 €
    expect(p.refundsCents).toBe(1649);
    // Cost of goods: 3 × 7,40 = 22,20 € (the returned unit is not recovered)
    expect(p.cogsCents).toBe(2220);
    expect(p.paymentFeesCents).toBe(159);
    expect(p.returnCostsCents).toBe(300);
    expect(p.adSpendCents).toBe(2000);
    // 49,46 − 16,49 − 22,20 − 1,59 − 3,00 − 20,00 = −13,82 €
    expect(p.profitCents).toBe(-1382);
    expect(p.orders).toBe(3);
    expect(p.marginPct).toBe(-0.4192); // −13,82 / 32,97
  });

  it("uses the actual supplier cost when it is known", () => {
    const [p] = realProfit([order("A", { supplierCostCents: 800 })], {}, "product");
    expect(p.cogsCents).toBe(800);
  });

  it("splits order-level amounts by each product's share", () => {
    const mixed = order("M", {
      shippingCents: 484, paymentFeeCents: 100, platformFeeCents: 0,
      items: [
        { productId: "P1", quantity: 1, unitPriceCents: 3000, vatRate: 0.21, unitCostCents: 1000 },
        { productId: "P2", quantity: 1, unitPriceCents: 1000, vatRate: 0.21, unitCostCents: 300 },
      ],
    });
    const lines = realProfit([mixed], {}, "product");
    const p1 = lines.find((l) => l.key === "P1")!;
    // P1 is 75 % of the order: sales 30/1,21 + 4,84/1,21 × 0,75 = 24,79 + 3,00 = 27,79 € ; fee 0,75 €
    expect(p1.netSalesCents).toBe(2779);
    expect(p1.paymentFeesCents).toBe(75);
  });

  it("ignores unpaid and cancelled orders", () => {
    expect(realProfit([order("X", { status: "pendiente_pago" }), order("Y", { status: "cancelado" })], {}, "product")).toEqual([]);
  });

  it("groups by channel and keeps ad spend apart", () => {
    const lines = realProfit([...orders, order("T", { channel: "tiktok_shop", platformFeeCents: 148, paymentFeeCents: 0 })], { P1: 2000 }, "channel");
    expect(lines.map((l) => l.key).sort()).toEqual(["anuncios", "tiktok_shop", "web"]);
    expect(lines.find((l) => l.key === "tiktok_shop")!.platformFeesCents).toBe(148);
  });
});

describe("VAT summary", () => {
  it("adds VAT collected and refunded per country and month", () => {
    const withMeta = orders.map((o) => ({ ...o, country: "ES", paidAt: "2026-11-03T10:00:00Z" }));
    expect(vatSummary(withMeta)).toEqual([
      // 3 × (19,95 − 16,4876) = 10,39 € ; refunded VAT 3,46 €
      { country: "ES", month: "2026-11", baseCents: 4946, vatCents: 1039, refundVatCents: 346 },
    ]);
  });
});
