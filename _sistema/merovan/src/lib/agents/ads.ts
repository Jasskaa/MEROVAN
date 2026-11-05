// Phase 5 rules for each ad: pause only when a criterion fails, otherwise keep or wait for data.
// Pure module; thresholds come from the decision rules Jaska edits in Ajustes.
import { DEFAULT_RULES, type DecisionRules } from "@/lib/domain/decision";

export interface AdRow {
  platform: string;
  campaign: string;
  ad: string;
  product: string | null;        // PRD code
  impressions: number;
  clicks: number;
  spend_cents: number;
  purchases: number;
  revenue_cents: number;
  test_cap_cents: number | null; // max spend for the test (campaign or product limit)
  break_even_cpa_cents: number | null;
}

export type AdVerdict = "pausar" | "mantener" | "esperar";

export interface AdReview extends AdRow { verdict: AdVerdict; reasons: string[]; ctr: number | null; cpa_cents: number | null; roas: number | null }

const pct = (n: number) => `${(n * 100).toFixed(2).replace(".", ",")} %`;
const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

export function reviewAd(a: AdRow, rules: DecisionRules = DEFAULT_RULES): AdReview {
  const ctr = a.impressions > 0 ? a.clicks / a.impressions : null;
  const cpa = a.purchases > 0 ? Math.round(a.spend_cents / a.purchases) : null;
  const roas = a.spend_cents > 0 ? a.revenue_cents / a.spend_cents : null;
  const reasons: string[] = [];

  if (ctr != null && a.impressions >= rules.minClicksForCtr && ctr < rules.ctrBad) {
    reasons.push(`CTR ${pct(ctr)} con ${a.impressions} impresiones, por debajo del mínimo ${pct(rules.ctrBad)}`);
  }
  if (a.test_cap_cents != null && a.spend_cents >= a.test_cap_cents && a.purchases === 0) {
    reasons.push(`Gasto ${eur(a.spend_cents)} alcanza el tope de test ${eur(a.test_cap_cents)} sin ventas`);
  }
  if (cpa != null && a.break_even_cpa_cents != null && a.break_even_cpa_cents > 0 && cpa > rules.cpaKillMultiple * a.break_even_cpa_cents) {
    reasons.push(`CPA ${eur(cpa)} supera ${rules.cpaKillMultiple} veces el CPA de equilibrio ${eur(a.break_even_cpa_cents)}`);
  }
  if (reasons.length) return { ...a, verdict: "pausar", reasons, ctr, cpa_cents: cpa, roas };

  const enoughData = a.impressions >= rules.minClicksForCtr || a.purchases > 0 || (a.test_cap_cents != null && a.spend_cents >= a.test_cap_cents / 2);
  return {
    ...a, ctr, cpa_cents: cpa, roas,
    verdict: enoughData ? "mantener" : "esperar",
    reasons: [enoughData ? "Cumple los criterios: no se pausa" : `Pocos datos (${a.impressions} impresiones): esperar antes de decidir`],
  };
}

export const adKey = (a: Pick<AdRow, "platform" | "campaign" | "ad">) => `${a.platform}|${a.campaign}|${a.ad}`;
