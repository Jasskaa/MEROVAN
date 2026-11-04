// Unit economics: contribution margin and break-even metrics.
// Pure module, all amounts in EUR (floats) and rates as fractions (0.21 = 21 %).
// Every comparison uses prices WITHOUT VAT, as required by the business rules.

export interface MarginInput {
  priceWithVat: number;
  vatRate: number;            // 0.21 by default
  productCost: number;
  shippingCost: number;
  platformCommissionPct: number; // channel commission on price without VAT (web: 0)
  paymentFeePct: number;      // applied on price with VAT
  paymentFeeFixed: number;
  returnsProvisionPct: number; // on price without VAT
  otherCosts: number;
  targetRoasFactor: number;   // 1.3-1.5
  testBudgetMultiplier: number; // 3-5
}

export interface MarginResult {
  priceWithoutVat: number;
  platformCommission: number;
  paymentFee: number;
  returnsProvision: number;
  contributionMargin: number;
  marginPct: number;          // contribution margin / price without VAT
  breakEvenCpa: number;
  breakEvenRoas: number | null; // null when margin <= 0 (cannot break even)
  targetRoas: number | null;
  testBudget: number;
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeMargin(i: MarginInput): MarginResult {
  if (i.priceWithVat <= 0) throw new Error("El precio de venta debe ser mayor que 0");
  if (i.vatRate < 0) throw new Error("El tipo de IVA no puede ser negativo");

  const priceWithoutVat = i.priceWithVat / (1 + i.vatRate);
  const platformCommission = priceWithoutVat * i.platformCommissionPct;
  const paymentFee = i.priceWithVat * i.paymentFeePct + i.paymentFeeFixed;
  const returnsProvision = priceWithoutVat * i.returnsProvisionPct;
  const contributionMargin =
    priceWithoutVat - i.productCost - i.shippingCost - platformCommission - paymentFee - returnsProvision - i.otherCosts;

  const canBreakEven = contributionMargin > 0;
  const breakEvenRoas = canBreakEven ? priceWithoutVat / contributionMargin : null;

  const warnings: string[] = [];
  if (!canBreakEven) warnings.push("Margen de contribución ≤ 0: el producto pierde dinero en cada venta.");
  else if (breakEvenRoas! > 4) warnings.push("ROAS de equilibrio > 4: difícil de rentabilizar con anuncios.");

  return {
    priceWithoutVat: round2(priceWithoutVat),
    platformCommission: round2(platformCommission),
    paymentFee: round2(paymentFee),
    returnsProvision: round2(returnsProvision),
    contributionMargin: round2(contributionMargin),
    marginPct: round2((contributionMargin / priceWithoutVat) * 100) / 100,
    breakEvenCpa: round2(Math.max(contributionMargin, 0)),
    breakEvenRoas: breakEvenRoas === null ? null : round2(breakEvenRoas),
    targetRoas: breakEvenRoas === null ? null : round2(breakEvenRoas * i.targetRoasFactor),
    testBudget: round2(Math.max(contributionMargin, 0) * i.testBudgetMultiplier),
    warnings,
  };
}
