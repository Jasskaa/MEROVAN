import Link from "next/link";
import { Card, Notice, Table } from "@/components/ui";
import { loadSettings, marginDefaults, requireRole } from "@/lib/admin";
import { computeMargin } from "@/lib/domain/margin";
import { type Metrics, computeMetrics, groupMetrics } from "@/lib/domain/metrics";
import { eur } from "@/lib/format";
import { PLATFORMS, angleLabel } from "@/lib/marketing";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Análisis de marketing" };

const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(2).replace(".", ",")} %`);
const money = (n: number | null) => (n == null ? "—" : eur(n));
const num = (n: number | null) => (n == null ? "—" : n.toFixed(2).replace(".", ","));

function MetricCells({ m }: { m: Metrics }) {
  return (
    <>
      <td className="tabular-nums">{eur(m.spend_cents)}</td>
      <td className="tabular-nums">{m.impressions.toLocaleString("es-ES")}</td>
      <td className="tabular-nums">{pct(m.ctr)}</td>
      <td className="tabular-nums">{money(m.cpc_cents)}</td>
      <td className="tabular-nums">{m.purchases}</td>
      <td className="tabular-nums">{money(m.cpa_cents)}</td>
      <td className="tabular-nums">{eur(m.revenue_cents)}</td>
      <td className="tabular-nums font-semibold">{num(m.roas)}</td>
    </>
  );
}
const HEAD = ["Gasto", "Impresiones", "CTR", "CPC", "Compras", "CPA", "Ingresos", "ROAS"];

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ dias?: string; plataforma?: string }> }) {
  await requireRole("owner", "marketing", "producto", "finanzas");
  const sp = await searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.dias ?? 30)));
  const platform = PLATFORMS.find((p) => p.key === sp.plataforma)?.key;
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

  const supabase = await createClient();
  let q = supabase.from("ad_metrics_daily")
    .select("day, platform, product_id, creative_id, impressions, clicks, spend_cents, add_to_cart, purchases, revenue_cents")
    .gte("day", since).limit(20000);
  if (platform) q = q.eq("platform", platform);
  const [{ data }, { data: products }, { data: creatives }, settings] = await Promise.all([
    q,
    supabase.from("products").select("id, code, name, price_cents, vat_rate, supplier_offers(role, unit_cost_cents, shipping_cents)"),
    supabase.from("creatives").select("id, code, hook, angle"),
    loadSettings(),
  ]);
  const rows = data ?? [];
  const opts = { revenueIncludesVat: settings.ad_revenue_includes_vat !== false, vatRate: Number(settings.vat_default ?? 0.21) };
  const total = computeMetrics(rows, opts);
  const defaults = marginDefaults(settings);

  // Break-even ROAS per product (web channel) to compare against real ROAS.
  const breakEven = (id: string) => {
    const p = products?.find((x) => x.id === id);
    const offer = p?.supplier_offers?.find((o) => o.role === "principal");
    if (!p?.price_cents || !offer) return null;
    return computeMargin({ ...defaults, priceWithVat: p.price_cents / 100, vatRate: Number(p.vat_rate),
      productCost: offer.unit_cost_cents / 100, shippingCost: offer.shipping_cents / 100 });
  };
  const creativeOf = (id: string) => creatives?.find((c) => c.id === id);

  const byProduct = groupMetrics(rows, (r) => r.product_id, opts);
  const byCreative = groupMetrics(rows, (r) => r.creative_id, opts);
  const byAngle = groupMetrics(rows, (r) => (r.creative_id ? creativeOf(r.creative_id)?.angle ?? null : null), opts);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Últimos {days} días · {platform ? PLATFORMS.find((p) => p.key === platform)?.label : "todas las plataformas"} ·
          ROAS {opts.revenueIncludesVat ? "con ingresos convertidos a sin IVA" : "con ingresos tal como los reporta la plataforma"}
        </p>
        <nav className="flex flex-wrap gap-1 text-sm">
          {[7, 14, 30, 90].map((d) => (
            <a key={d} href={`?dias=${d}${platform ? `&plataforma=${platform}` : ""}`} className={`rounded-md border px-3 py-1 ${d === days ? "border-gold text-gold" : "border-border"}`}>{d} d</a>
          ))}
          <span className="mx-1" />
          <a href={`?dias=${days}`} className={`rounded-md border px-3 py-1 ${!platform ? "border-gold text-gold" : "border-border"}`}>Todas</a>
          {PLATFORMS.map((p) => (
            <a key={p.key} href={`?dias=${days}&plataforma=${p.key}`} className={`rounded-md border px-3 py-1 ${p.key === platform ? "border-gold text-gold" : "border-border"}`}>{p.label}</a>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <Notice>No hay métricas en este periodo. Súbelas en <Link href="/admin/marketing/importar" className="text-gold underline">Importar métricas</Link>.</Notice>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              ["Gasto", eur(total.spend_cents)], ["Ingresos", eur(total.revenue_cents)], ["ROAS", num(total.roas)],
              ["CPA", money(total.cpa_cents)], ["CTR", pct(total.ctr)], ["Compras", String(total.purchases)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </section>

          <Card title="Por producto">
            <Table head={["Producto", ...HEAD, "ROAS equilibrio", "Situación"]}>
              {byProduct.map((m) => {
                const p = products?.find((x) => x.id === m.key);
                const be = p ? breakEven(p.id) : null;
                const status = !be?.breakEvenRoas || m.roas == null ? "—"
                  : m.roas >= (be.targetRoas ?? Infinity) ? "por encima del objetivo"
                  : m.roas >= be.breakEvenRoas ? "rentable, bajo objetivo" : "perdiendo dinero";
                return (
                  <tr key={m.key}>
                    <td>{p ? <Link href={`/admin/productos/${p.code}`} className="hover:text-gold">{p.code} · {p.name}</Link> : m.key}</td>
                    <MetricCells m={m} />
                    <td className="tabular-nums">{be?.breakEvenRoas != null ? num(be.breakEvenRoas) : "—"}</td>
                    <td className={status === "perdiendo dinero" ? "text-danger" : status === "por encima del objetivo" ? "text-ok" : ""}>{status}</td>
                  </tr>
                );
              })}
            </Table>
            <p className="mt-2 text-xs text-muted">La recomendación escalar / arreglar / matar con reglas completas llega en la Fase E.</p>
          </Card>

          <Card title="Por creatividad (ranking por gasto)">
            <Table head={["Creatividad", "Gancho", "Ángulo", ...HEAD]}>
              {byCreative.map((m) => {
                const c = creativeOf(m.key);
                return (
                  <tr key={m.key}>
                    <td className="font-mono text-xs">{c?.code ?? m.key}</td>
                    <td className="max-w-56">{c?.hook ?? "—"}</td>
                    <td>{c ? angleLabel(c.angle) : "—"}</td>
                    <MetricCells m={m} />
                  </tr>
                );
              })}
            </Table>
          </Card>

          <Card title="Por ángulo">
            <Table head={["Ángulo", ...HEAD]}>
              {byAngle.map((m) => <tr key={m.key}><td>{angleLabel(m.key)}</td><MetricCells m={m} /></tr>)}
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
