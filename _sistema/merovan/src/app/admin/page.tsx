import Link from "next/link";
import { DecisionBadge } from "@/components/decision-badge";
import { Card, Notice } from "@/components/ui";
import { statusLabel } from "@/lib/domain/product";
import { eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const pctFmt = (n: number) => `${n.toFixed(2).replace(".", ",")} %`;

// Weekly summary, products in play with the engine's recommendation, and alerts.
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sin_permiso?: string }> }) {
  const { sin_permiso } = await searchParams;
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const sinceDay = since.slice(0, 10);
  const tenDaysAgo = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);

  const [sales, visits, carts, ads, products, recs, offers, samples, approvals, unverified] = await Promise.all([
    supabase.from("daily_sales").select("orders, revenue_cents").gte("day", sinceDay),
    supabase.from("page_views").select("*", { count: "exact", head: true }).gte("at", since),
    supabase.from("cart_overview").select("status, value_cents").gt("items", 0).gte("created_at", since),
    supabase.from("ad_metrics_daily").select("spend_cents").gte("day", sinceDay),
    supabase.from("products").select("id, code, name, status, publish_status, price_cents, legal_red_flag, gpsr_manufacturer, gpsr_address, gpsr_contact")
      .not("status", "in", "(descartado,idea)").order("code"),
    supabase.from("recommendations").select("product_id, decision, confidence, reasons, status, metrics").in("status", ["pendiente", "aceptada"]),
    supabase.from("supplier_offers").select("measured_days, promised_days, products(code, name), suppliers(name)").not("measured_days", "is", null),
    supabase.from("samples").select("code, ordered_at, products(code, name)").eq("status", "pedida").lte("ordered_at", tenDaysAgo),
    supabase.from("approvals").select("*", { count: "exact", head: true }).eq("status", "pendiente"),
    supabase.from("settings").select("*", { count: "exact", head: true }).eq("verified", false),
  ]);

  const orders = sales.data?.reduce((s, r) => s + Number(r.orders), 0) ?? 0;
  const revenue = sales.data?.reduce((s, r) => s + Number(r.revenue_cents), 0) ?? 0;
  const spend = ads.data?.reduce((s, r) => s + r.spend_cents, 0) ?? 0;
  const cartRows = carts.data ?? [];
  const abandoned = cartRows.filter((c) => c.status === "abandonado");
  const conversion = visits.count ? (orders / visits.count) * 100 : 0;
  const recFor = (id: string) => recs.data?.find((r) => r.product_id === id);

  const kpis = [
    { label: "Ingresos tienda (IVA incl.)", value: sales.error ? "—" : eur(revenue) },
    { label: "Pedidos", value: sales.error ? "—" : String(orders) },
    { label: "Gasto en anuncios", value: ads.error ? "—" : eur(spend) },
    { label: "Páginas vistas", value: String(visits.count ?? 0) },
    { label: "Carritos abandonados", value: `${abandoned.length} · ${eur(abandoned.reduce((s, c) => s + c.value_cents, 0))}` },
    { label: "Conversión", value: pctFmt(conversion) },
  ];

  type Alert = { tone: "danger" | "neutral"; text: string; href: string };
  const alerts: Alert[] = [];
  for (const p of products.data ?? []) {
    const r = recFor(p.id);
    const m = r?.metrics as { spendCents?: number; testCapCents?: number | null; purchases?: number } | undefined;
    if (m?.testCapCents && (m.spendCents ?? 0) >= m.testCapCents && (m.purchases ?? 0) === 0)
      alerts.push({ tone: "danger", text: `${p.code} ${p.name}: tope de test superado sin ventas`, href: "/admin/decisiones" });
    if (r?.decision === "matar" && r.status === "pendiente")
      alerts.push({ tone: "danger", text: `${p.code} ${p.name}: el motor recomienda MATAR`, href: "/admin/decisiones" });
    if (p.legal_red_flag)
      alerts.push({ tone: "danger", text: `${p.code} ${p.name}: bandera roja legal`, href: `/admin/productos/${p.code}#legal` });
    if (p.publish_status === "publicado" && !(p.gpsr_manufacturer && p.gpsr_address && p.gpsr_contact))
      alerts.push({ tone: "danger", text: `${p.code} ${p.name}: publicado sin datos GPSR completos`, href: `/admin/productos/${p.code}#datos` });
  }
  for (const o of offers.data ?? []) {
    if (o.promised_days && o.measured_days > o.promised_days) {
      const prod = o.products as unknown as { code: string; name: string } | null;
      const sup = o.suppliers as unknown as { name: string } | null;
      alerts.push({ tone: "neutral", text: `${sup?.name}: plazo real ${o.measured_days} d frente a ${o.promised_days} d prometidos (${prod?.code})`, href: `/admin/productos/${prod?.code}#proveedores` });
    }
  }
  for (const s of samples.data ?? []) {
    const prod = s.products as unknown as { code: string; name: string } | null;
    alerts.push({ tone: "neutral", text: `Muestra ${s.code} (${prod?.name}) pedida hace más de 10 días`, href: `/admin/productos/${prod?.code}#muestras` });
  }
  if ((approvals.count ?? 0) > 0)
    alerts.push({ tone: "neutral", text: `${approvals.count} solicitud(es) pendientes de aprobación`, href: "/admin/aprobaciones" });
  if ((unverified.count ?? 0) > 0)
    alerts.push({ tone: "neutral", text: `${unverified.count} parámetro(s) de plataforma «a verificar»`, href: "/admin/ajustes" });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Panel</h1>
        <p className="text-sm text-muted">Últimos 7 días</p>
      </header>
      {sin_permiso && <Notice tone="danger">No tienes permiso para abrir esa sección.</Notice>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </section>

      {alerts.length > 0 && (
        <Card title={`Alertas (${alerts.length})`}>
          <ul className="space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.text}>
                <Link href={a.href} className={`hover:underline ${a.tone === "danger" ? "text-danger" : ""}`}>
                  {a.tone === "danger" ? "● " : "○ "}{a.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Productos en juego" actions={<Link href="/admin/decisiones" className="text-xs text-muted hover:text-gold">Ver decisiones →</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="p-2">Producto</th><th className="p-2">Estado</th><th className="p-2">Precio</th>
                <th className="p-2">ROAS</th><th className="p-2">CPA</th><th className="p-2">Recomendación</th><th className="p-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {(products.data ?? []).map((p) => {
                const r = recFor(p.id);
                const m = r?.metrics as { roas?: number | null; cpaCents?: number | null } | undefined;
                return (
                  <tr key={p.code} className="border-t border-border">
                    <td className="p-2"><Link href={`/admin/productos/${p.code}`} className="hover:text-gold"><span className="font-mono text-xs">{p.code}</span> {p.name}</Link></td>
                    <td className="p-2">{statusLabel(p.status)}</td>
                    <td className="p-2 tabular-nums">{p.price_cents != null ? eur(p.price_cents) : "—"}</td>
                    <td className="p-2 tabular-nums">{m?.roas != null ? m.roas.toFixed(2).replace(".", ",") : "—"}</td>
                    <td className="p-2 tabular-nums">{m?.cpaCents != null ? eur(Math.round(m.cpaCents)) : "—"}</td>
                    <td className="p-2">{r ? <DecisionBadge decision={r.decision} /> : <span className="text-xs text-muted">sin datos</span>}</td>
                    <td className="max-w-72 p-2 text-xs text-muted">{r?.reasons?.[0] ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
