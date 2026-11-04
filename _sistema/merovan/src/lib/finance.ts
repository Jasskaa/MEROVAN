import "server-only";
import type { ProfitOrder } from "@/lib/domain/profit";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Default period: current month (Europe/Madrid dates as YYYY-MM-DD). */
export function period(desde?: string, hasta?: string) {
  const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const now = new Date();
  const from = ok(desde) ?? `${now.toISOString().slice(0, 7)}-01`;
  const to = ok(hasta) ?? now.toISOString().slice(0, 10);
  return { from, to };
}

/** Orders paid in the period, shaped for the profit calculation, plus ad spend and expenses. */
export async function loadFinance(supabase: Supabase, from: string, to: string) {
  const toEnd = `${to}T23:59:59.999Z`;
  const [{ data: orders }, { data: ads }, { data: expenses }] = await Promise.all([
    supabase.from("orders")
      .select("id, number, channel, status, shipping_cents, platform_fee_cents, payment_fee_cents, shipping_country, paid_at, total_cents, vat_cents, external_ref, payment_ref, " +
        "order_items(product_id, quantity, unit_price_cents, unit_cost_cents, products(code, name, vat_rate)), supplier_orders(cost_cents), " +
        "returns(status, refund_cents, return_cost_cents), disputes(status, amount_cents, fee_cents)")
      .gte("paid_at", from).lte("paid_at", toEnd).order("paid_at"),
    supabase.from("ad_metrics_daily").select("product_id, spend_cents").gte("day", from).lte("day", to),
    supabase.from("expenses").select("*").gte("spent_on", from).lte("spent_on", to).order("spent_on", { ascending: false }),
  ]);

  type Row = {
    id: string; number: number; channel: string; status: string; shipping_cents: number; platform_fee_cents: number;
    payment_fee_cents: number; shipping_country: string; paid_at: string; total_cents: number; vat_cents: number;
    external_ref: string | null; payment_ref: string | null;
    order_items: { product_id: string; quantity: number; unit_price_cents: number; unit_cost_cents: number | null; products: { code: string; name: string; vat_rate: number } }[];
    supplier_orders: { cost_cents: number | null } | null;
    returns: { status: string; refund_cents: number; return_cost_cents: number }[];
    disputes: { status: string; amount_cents: number; fee_cents: number }[];
  };
  const rows = (orders ?? []) as unknown as Row[];

  const profitOrders = rows.map((o) => ({
    id: o.id,
    channel: o.channel,
    status: o.status,
    shippingCents: o.shipping_cents,
    platformFeeCents: o.platform_fee_cents,
    paymentFeeCents: o.payment_fee_cents,
    items: o.order_items.map((i) => ({
      productId: i.product_id, quantity: i.quantity, unitPriceCents: i.unit_price_cents,
      vatRate: Number(i.products?.vat_rate ?? 0.21), unitCostCents: i.unit_cost_cents,
    })),
    supplierCostCents: o.supplier_orders?.cost_cents ?? null,
    refundCents: o.returns.filter((r) => r.status === "reembolsada").reduce((s, r) => s + r.refund_cents, 0),
    returnCostCents: o.returns.filter((r) => r.status !== "rechazada").reduce((s, r) => s + r.return_cost_cents, 0),
    chargebackLossCents: o.disputes.filter((d) => d.status === "perdida").reduce((s, d) => s + d.amount_cents + d.fee_cents, 0),
    country: o.shipping_country,
    paidAt: o.paid_at,
  })) satisfies (ProfitOrder & { country: string; paidAt: string })[];

  const adSpend: Record<string, number> = {};
  for (const a of ads ?? []) if (a.product_id) adSpend[a.product_id] = (adSpend[a.product_id] ?? 0) + a.spend_cents;

  const products = new Map<string, { code: string; name: string }>();
  for (const o of rows) for (const i of o.order_items) if (i.products) products.set(i.product_id, { code: i.products.code, name: i.products.name });

  return { rows, profitOrders, adSpend, expenses: expenses ?? [], products };
}
