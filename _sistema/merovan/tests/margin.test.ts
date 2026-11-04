import { describe, expect, it } from "vitest";
import { computeMargin, type MarginInput } from "@/lib/domain/margin";

// PRD-0001 example from the vault, verified by hand:
// 19.95 / 1.21 = 16.4876 ; fee = 19.95*0.014 + 0.25 = 0.5293 ; returns = 16.4876*0.06 = 0.9893
// margin = 16.4876 - 4.50 - 2.90 - 0 - 0.5293 - 0.9893 - 0.45 = 7.1190
const web: MarginInput = {
  priceWithVat: 19.95,
  vatRate: 0.21,
  productCost: 4.5,
  shippingCost: 2.9,
  platformCommissionPct: 0,
  paymentFeePct: 0.014,
  paymentFeeFixed: 0.25,
  returnsProvisionPct: 0.06,
  otherCosts: 0.45,
  targetRoasFactor: 1.4,
  testBudgetMultiplier: 4,
};

describe("computeMargin", () => {
  it("matches the hand-checked web example", () => {
    const r = computeMargin(web);
    expect(r.priceWithoutVat).toBe(16.49);
    expect(r.paymentFee).toBe(0.53);
    expect(r.returnsProvision).toBe(0.99);
    expect(r.contributionMargin).toBe(7.12);
    expect(r.breakEvenCpa).toBe(7.12);
    expect(r.breakEvenRoas).toBe(2.32);   // 16.4876 / 7.1190
    expect(r.targetRoas).toBe(3.24);      // 2.3160 * 1.4
    expect(r.testBudget).toBe(28.48);     // 7.1190 * 4
    expect(r.warnings).toEqual([]);
  });

  it("subtracts the TikTok Shop commission on price without VAT", () => {
    // commission = 16.4876 * 0.09 = 1.4839 ; margin = 7.1190 - 1.4839 = 5.6351
    const r = computeMargin({ ...web, platformCommissionPct: 0.09 });
    expect(r.platformCommission).toBe(1.48);
    expect(r.contributionMargin).toBe(5.64);
    expect(r.breakEvenRoas).toBe(2.93);   // 16.4876 / 5.6351
  });

  it("flags products that lose money and returns no break-even ROAS", () => {
    const r = computeMargin({ ...web, productCost: 15 });
    expect(r.contributionMargin).toBeLessThan(0);
    expect(r.breakEvenRoas).toBeNull();
    expect(r.breakEvenCpa).toBe(0);
    expect(r.testBudget).toBe(0);
    expect(r.warnings[0]).toMatch(/Margen de contribución ≤ 0/);
  });

  it("warns when break-even ROAS is above 4", () => {
    const r = computeMargin({ ...web, productCost: 10 }); // margin ≈ 1.62 → ROAS ≈ 10.2
    expect(r.breakEvenRoas!).toBeGreaterThan(4);
    expect(r.warnings[0]).toMatch(/ROAS de equilibrio > 4/);
  });

  it("rejects a zero price", () => {
    expect(() => computeMargin({ ...web, priceWithVat: 0 })).toThrow(/mayor que 0/);
  });
});
