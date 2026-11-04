// Phase 2 numbers: supplier ranking and pricing. Pure module. Agents never type a margin or a
// ranking themselves: tools call these functions, so the figures shown to Jaska are always computed.
import { type MarginInput, computeMargin } from "@/lib/domain/margin";
import { scorePasses, type Scores } from "@/lib/domain/product";

export const EU_COUNTRIES = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];

export interface Offer {
  supplier: string;
  warehouse_country: string;   // ISO code of the warehouse that ships
  unit_cost_cents: number;     // without VAT
  shipping_cents: number;      // to Spain, without VAT
  promised_days: number;
  reliability?: number;        // 0-1 if known (history, samples)
  source: string;              // where the figure comes from: URL, "catalogo:BigBuy", "ejemplo", "estimacion"
}

export interface RankedOffer extends Offer { landed_cents: number; eu: boolean; score: number }

export interface SupplierPlan {
  principal: RankedOffer | null;
  respaldo: RankedOffer | null;
  ranking: RankedOffer[];
  real_data: boolean;          // false when any chosen figure is an estimate or an example
  warnings: string[];
}

const estimated = (o: Offer) => /^(ejemplo|estimaci[oó]n)/i.test(o.source.trim());

/** Ranks offers: EU warehouse first, then a score on landed cost (60 %), delivery days (25 %) and reliability (15 %). */
export function rankOffers(offers: Offer[]): SupplierPlan {
  const warnings: string[] = [];
  if (offers.length === 0) return { principal: null, respaldo: null, ranking: [], real_data: false, warnings: ["Sin ofertas de proveedor"] };
  const rows = offers.map((o) => ({ ...o, warehouse_country: o.warehouse_country.toUpperCase(), landed_cents: o.unit_cost_cents + o.shipping_cents, eu: EU_COUNTRIES.includes(o.warehouse_country.toUpperCase()) }));
  const minCost = Math.min(...rows.map((r) => r.landed_cents));
  const minDays = Math.min(...rows.map((r) => r.promised_days));
  const ranking = rows
    .map((r) => ({
      ...r,
      score: Math.round((0.6 * (minCost / Math.max(r.landed_cents, 1)) + 0.25 * (Math.max(minDays, 1) / Math.max(r.promised_days, 1)) + 0.15 * (r.reliability ?? 0.5)) * 100),
    }))
    .sort((a, b) => Number(b.eu) - Number(a.eu) || b.score - a.score);

  const principal = ranking[0];
  const respaldo = ranking.find((r) => r.supplier.toLowerCase() !== principal.supplier.toLowerCase()) ?? null;
  if (!principal.eu) warnings.push("Ningún proveedor envía desde un almacén de la UE: plazos y devoluciones en riesgo");
  if (!respaldo) warnings.push("Falta un proveedor de respaldo distinto del principal");
  else if (!respaldo.eu) warnings.push("El proveedor de respaldo no tiene almacén en la UE");
  if (principal.promised_days > 7) warnings.push(`Plazo del principal de ${principal.promised_days} días: largo para España`);
  const chosen = [principal, respaldo].filter(Boolean) as RankedOffer[];
  const real = chosen.every((o) => !estimated(o));
  if (!real) warnings.push("Hay cifras de ejemplo o estimadas: confirmar con el catálogo oficial o una muestra");
  return { principal, respaldo, ranking, real_data: real, warnings };
}

export type MarginDefaults = Omit<MarginInput, "priceWithVat" | "productCost" | "shippingCost">;

export interface PriceLimits { minMarginPct: number; priceMinCents: number; priceMaxCents: number }

export interface PriceResult {
  ok: boolean;
  price_cents: number | null;
  margin_pct: number | null;    // contribution margin over price without VAT, %
  margin_cents: number | null;
  break_even_roas: number | null;
  reasons: string[];
}

/** Lowest "x,95 €" price inside the allowed range whose contribution margin reaches the minimum. */
export function recommendPrice(landedCents: number, defaults: MarginDefaults, limits: PriceLimits): PriceResult {
  const reasons: string[] = [];
  if (limits.priceMaxCents <= 0 || limits.priceMaxCents < limits.priceMinCents) {
    return { ok: false, price_cents: null, margin_pct: null, margin_cents: null, break_even_roas: null, reasons: ["Rango de precios no configurado en Límites"] };
  }
  const first = Math.max(1, Math.ceil(limits.priceMinCents / 100));
  for (let euros = first; euros * 100 - 5 <= limits.priceMaxCents; euros++) {
    const price = euros * 100 - 5;
    if (price < limits.priceMinCents) continue;
    const m = marginAt(price, landedCents, defaults);
    if (m.marginPct * 100 >= limits.minMarginPct) {
      return { ok: true, price_cents: price, margin_pct: Math.round(m.marginPct * 1000) / 10, margin_cents: Math.round(m.contributionMargin * 100), break_even_roas: m.breakEvenRoas, reasons };
    }
  }
  const atMax = marginAt(limits.priceMaxCents, landedCents, defaults);
  reasons.push(`Ni al precio máximo (${(limits.priceMaxCents / 100).toFixed(2)} €) se alcanza el margen mínimo del ${limits.minMarginPct} %: margen ${(atMax.marginPct * 100).toFixed(1)} %`);
  return { ok: false, price_cents: null, margin_pct: Math.round(atMax.marginPct * 1000) / 10, margin_cents: Math.round(atMax.contributionMargin * 100), break_even_roas: atMax.breakEvenRoas, reasons };
}

export function marginAt(priceCents: number, landedCents: number, defaults: MarginDefaults) {
  return computeMargin({ ...defaults, priceWithVat: priceCents / 100, productCost: landedCents / 100, shippingCost: 0 });
}

/** Scorecard of a candidate, computed by the system from the 0-5 scores the researcher gives. */
export function scoreCandidate(scores: Scores) {
  const { total, passes, reasons } = scorePasses(scores);
  return { score_total: total, passes, score_reasons: reasons };
}
