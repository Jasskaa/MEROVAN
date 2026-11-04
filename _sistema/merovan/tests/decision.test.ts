import { describe, expect, it } from "vitest";
import { type DecisionInput, confidenceFor, decide } from "@/lib/domain/decision";

// Organizador de cables: margin 7,57 € → break-even ROAS 2,18, target 3,05, test cap 30,28 €.
const base: DecisionInput = {
  spendCents: 20000,
  impressions: 60000,
  clicks: 900,
  addToCart: 60,
  purchases: 20,
  revenueCents: 70000,
  daysWithSpend: 10,
  creativesTested: 4,
  dailyRoas: [3.1, 3.4, 3.6],
  contributionMarginCents: 757,
  breakEvenRoas: 2.18,
  targetRoas: 3.05,
  testCapCents: null,
  returnRate: 0.03,
};

const ids = (r: ReturnType<typeof decide>) => r.checks.filter((c) => c.hit).map((c) => c.id);

describe("decision engine", () => {
  it("ESCALAR: ROAS 3,5 ≥ 3,05 with 20 orders and 3 stable days", () => {
    const r = decide(base);
    expect(r.decision).toBe("escalar");
    expect(r.roas).toBe(3.5);
    expect(r.confidence).toBe("alta");
    expect(ids(r)).toEqual(["roas_objetivo", "pedidos", "tendencia", "ventana"]);
  });

  it("does not scale on an unstable trend", () => {
    expect(decide({ ...base, dailyRoas: [4, 1.5, 4] }).decision).toBe("arreglar");
  });

  it("MATAR: contribution margin ≤ 0", () => {
    const r = decide({ ...base, contributionMarginCents: -100 });
    expect(r.decision).toBe("matar");
    expect(r.reasons[0]).toMatch(/Margen/);
  });

  it("MATAR: spend over the cap without meeting the scale criteria", () => {
    const r = decide({ ...base, testCapCents: 3028, spendCents: 3500, purchases: 1, revenueCents: 1650, clicks: 120, daysWithSpend: 4 });
    expect(r.decision).toBe("matar");
    expect(r.reasons[0]).toBe("Tope de gasto superado");
  });

  it("MATAR: CPA > 3 × break-even CPA (7,57 € → 22,71 €)", () => {
    const r = decide({ ...base, spendCents: 5000, purchases: 2, revenueCents: 3300 }); // CPA 25 €
    expect(r.decision).toBe("matar");
    expect(r.checks.find((c) => c.id === "cpa")).toMatchObject({ hit: true, value: "25,00 €", threshold: "22,71 €" });
  });

  it("MATAR: spend above 3 × break-even CPA with no sales at all", () => {
    expect(decide({ ...base, spendCents: 2400, purchases: 0, revenueCents: 0 }).decision).toBe("matar");
  });

  it("MATAR: CTR < 0,5 % after 3+ creatives", () => {
    const r = decide({ ...base, impressions: 100000, clicks: 400, purchases: 3, revenueCents: 1000, spendCents: 1500 });
    expect(r.decision).toBe("matar");
    expect(ids(r)).toContain("ctr_bajo");
  });

  it("MATAR: returns above threshold", () => {
    expect(decide({ ...base, returnRate: 0.2 }).decision).toBe("matar");
  });

  it("ESPERAR: little data inside the test window", () => {
    const r = decide({ ...base, spendCents: 900, impressions: 3000, clicks: 40, purchases: 0, revenueCents: 0, daysWithSpend: 2, addToCart: 1 });
    expect(r.decision).toBe("esperar");
    expect(r.confidence).toBe("baja");
  });

  it("ARREGLAR: ROAS between break-even and target → raise AOV / price", () => {
    const r = decide({ ...base, revenueCents: 50000, dailyRoas: [2.4, 2.5, 2.6] }); // ROAS 2,5
    expect(r.decision).toBe("arreglar");
    expect(r.reasons[0]).toMatch(/entre equilibrio/);
  });

  it("ARREGLAR: good CTR but low conversion → page / offer", () => {
    const r = decide({ ...base, clicks: 1200, purchases: 8, revenueCents: 30000, spendCents: 15000, dailyRoas: [2, 2, 2] });
    expect(r.decision).toBe("arreglar");
    expect(r.reasons.some((x) => /página, la oferta o el precio/.test(x))).toBe(true);
  });

  it("ARREGLAR: many add-to-carts but few purchases → checkout", () => {
    const r = decide({ ...base, addToCart: 80, purchases: 10, clicks: 600, revenueCents: 40000, dailyRoas: [2, 2, 2] });
    expect(r.reasons.some((x) => /checkout/.test(x))).toBe(true);
  });

  it("rates confidence by orders and clicks", () => {
    expect(confidenceFor(10, 300)).toBe("alta");
    expect(confidenceFor(3, 50)).toBe("media");
    expect(confidenceFor(0, 20)).toBe("baja");
  });
});
