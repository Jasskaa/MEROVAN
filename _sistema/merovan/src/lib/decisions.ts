import "server-only";
import { loadSettings, marginDefaults } from "@/lib/admin";
import { DEFAULT_RULES, type DecisionInput, type DecisionRules, decide } from "@/lib/domain/decision";
import { computeMargin } from "@/lib/domain/margin";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Gathers each product's test data, runs the engine and stores one pending recommendation per product. */
export async function runDecisionEngine(supabase: Supabase) {
  const settings = await loadSettings();
  const rules: DecisionRules = { ...DEFAULT_RULES, ...((settings.decision_rules as Partial<DecisionRules>) ?? {}) };
  const windowDays = Number(settings.decision_window_days ?? 14);
  const vatRate = Number(settings.vat_default ?? 0.21);
  const revenueIncludesVat = settings.ad_revenue_includes_vat !== false;
  const defaults = marginDefaults(settings);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - windowDays * 864e5).toISOString().slice(0, 10);

  const [{ data: products }, { data: metrics }, { data: campaigns }, { data: items }] = await Promise.all([
    supabase.from("products")
      .select("id, code, status, price_cents, vat_rate, supplier_offers(role, unit_cost_cents, shipping_cents)")
      .in("status", ["en_test", "escalando", "listo_para_publicar", "pausado"]),
    supabase.from("ad_metrics_daily")
      .select("product_id, creative_id, day, impressions, clicks, spend_cents, add_to_cart, purchases, revenue_cents")
      .gte("day", from).lte("day", to).not("product_id", "is", null),
    supabase.from("campaigns").select("product_id, test_cap_cents").not("test_cap_cents", "is", null),
    supabase.from("order_items").select("product_id, orders(status)"),
  ]);

  const results: { code: string; decision: string }[] = [];
  for (const p of products ?? []) {
    const rows = (metrics ?? []).filter((m) => m.product_id === p.id);
    if (rows.length === 0 && p.status !== "en_test") continue;

    const sum = (k: "impressions" | "clicks" | "spend_cents" | "add_to_cart" | "purchases" | "revenue_cents") =>
      rows.reduce((s, r) => s + r[k], 0);
    const net = (cents: number) => (revenueIncludesVat ? cents / (1 + vatRate) : cents);
    const byDay = new Map<string, { spend: number; revenue: number }>();
    for (const r of rows) {
      const d = byDay.get(r.day) ?? { spend: 0, revenue: 0 };
      byDay.set(r.day, { spend: d.spend + r.spend_cents, revenue: d.revenue + r.revenue_cents });
    }
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

    const offer = p.supplier_offers?.find((o) => o.role === "principal");
    const margin = p.price_cents && offer
      ? computeMargin({ ...defaults, priceWithVat: p.price_cents / 100, vatRate: Number(p.vat_rate),
          productCost: offer.unit_cost_cents / 100, shippingCost: offer.shipping_cents / 100 })
      : null;
    const caps = (campaigns ?? []).filter((c) => c.product_id === p.id).map((c) => c.test_cap_cents as number);

    const productOrders = (items ?? []).filter((i) => i.product_id === p.id)
      .map((i) => (i.orders as unknown as { status: string } | null)?.status)
      .filter((s) => s && s !== "pendiente_pago" && s !== "cancelado");
    const returnRate = productOrders.length ? productOrders.filter((s) => s === "reembolsado").length / productOrders.length : null;

    const input: DecisionInput = {
      spendCents: sum("spend_cents"),
      impressions: sum("impressions"),
      clicks: sum("clicks"),
      addToCart: sum("add_to_cart"),
      purchases: sum("purchases"),
      revenueCents: Math.round(net(sum("revenue_cents"))),
      daysWithSpend: days.filter(([, d]) => d.spend > 0).length,
      creativesTested: new Set(rows.filter((r) => r.spend_cents > 0 && r.creative_id).map((r) => r.creative_id)).size,
      dailyRoas: days.map(([, d]) => (d.spend > 0 ? Math.round((net(d.revenue) / d.spend) * 100) / 100 : null)),
      contributionMarginCents: margin ? Math.round(margin.contributionMargin * 100) : null,
      breakEvenRoas: margin?.breakEvenRoas ?? null,
      targetRoas: margin?.targetRoas ?? null,
      testCapCents: caps.length ? Math.max(...caps) : margin ? Math.round(margin.testBudget * 100) : null,
      returnRate,
    };
    const r = decide(input, rules);

    await supabase.from("recommendations").update({ status: "sustituida" }).eq("product_id", p.id).eq("status", "pendiente");
    await supabase.from("recommendations").insert({
      product_id: p.id, decision: r.decision, confidence: r.confidence, reasons: r.reasons, actions: r.actions,
      checks: r.checks, metrics: { ...input, roas: r.roas, cpaCents: r.cpaCents, ctr: r.ctr },
      period_from: from, period_to: to,
    });
    results.push({ code: p.code, decision: r.decision });
  }
  return results;
}
