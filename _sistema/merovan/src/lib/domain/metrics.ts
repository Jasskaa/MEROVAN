// Ad performance metrics. Pure module; amounts in cents.
// Ad platforms may report revenue with VAT included: `revenueIncludesVat` converts it so that
// ROAS is compared with the break-even ROAS on the same basis (prices without VAT).

export interface MetricRow {
  impressions: number;
  clicks: number;
  spend_cents: number;
  add_to_cart: number;
  purchases: number;
  revenue_cents: number;
}

export interface Metrics extends MetricRow {
  ctr: number | null;         // clicks / impressions
  cpc_cents: number | null;   // spend / clicks
  cpm_cents: number | null;   // spend / impressions × 1000
  cpa_cents: number | null;   // spend / purchases
  roas: number | null;        // revenue (without VAT) / spend
  conversion: number | null;  // purchases / clicks
  atc_rate: number | null;    // add to cart / clicks
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);
const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
const r4 = (n: number | null) => (n == null ? null : Math.round(n * 10000) / 10000);

export function sumRows(rows: MetricRow[]): MetricRow {
  return rows.reduce(
    (s, r) => ({
      impressions: s.impressions + r.impressions,
      clicks: s.clicks + r.clicks,
      spend_cents: s.spend_cents + r.spend_cents,
      add_to_cart: s.add_to_cart + r.add_to_cart,
      purchases: s.purchases + r.purchases,
      revenue_cents: s.revenue_cents + r.revenue_cents,
    }),
    { impressions: 0, clicks: 0, spend_cents: 0, add_to_cart: 0, purchases: 0, revenue_cents: 0 },
  );
}

export function computeMetrics(rows: MetricRow[], opts: { revenueIncludesVat?: boolean; vatRate?: number } = {}): Metrics {
  const t = sumRows(rows);
  const revenue = opts.revenueIncludesVat ? t.revenue_cents / (1 + (opts.vatRate ?? 0.21)) : t.revenue_cents;
  return {
    ...t,
    ctr: r4(div(t.clicks, t.impressions)),
    cpc_cents: r2(div(t.spend_cents, t.clicks)),
    cpm_cents: r2(div(t.spend_cents * 1000, t.impressions)),
    cpa_cents: r2(div(t.spend_cents, t.purchases)),
    roas: r2(div(revenue, t.spend_cents)),
    conversion: r4(div(t.purchases, t.clicks)),
    atc_rate: r4(div(t.add_to_cart, t.clicks)),
  };
}

/** Groups rows by a key and computes metrics per group, sorted by spend (desc). */
export function groupMetrics<T extends MetricRow>(
  rows: T[],
  key: (r: T) => string | null,
  opts?: { revenueIncludesVat?: boolean; vatRate?: number },
) {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r) ?? "(sin asignar)";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([k, g]) => ({ key: k, ...computeMetrics(g, opts) }))
    .sort((a, b) => b.spend_cents - a.spend_cents);
}
