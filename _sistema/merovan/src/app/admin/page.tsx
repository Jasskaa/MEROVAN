import Link from "next/link";
import { BarChart, Delta, LineChart, RankBars } from "@/components/admin/charts";
import { DecisionBadge } from "@/components/decision-badge";
import { Card, Notice } from "@/components/ui";
import { statusLabel } from "@/lib/domain/product";
import { eur } from "@/lib/format";
import { createClient, getStaff } from "@/lib/supabase/server";

const DAY = 864e5;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shortEur = (c: number) => (c >= 100000 ? `${(c / 100000).toFixed(1).replace(".", ",")}k €` : `${Math.round(c / 100)} €`);
const PERIODS = { "7": "7 días", "30": "30 días", mes: "Este mes" } as const;
type PeriodKey = keyof typeof PERIODS;

/** Current period and the immediately preceding one of the same length. */
function periods(key: PeriodKey) {
  const today = new Date(`${isoDay(new Date())}T00:00:00Z`);
  const days = key === "mes" ? today.getUTCDate() : Number(key);
  const from = new Date(today.getTime() - (days - 1) * DAY);
  const prevFrom = key === "mes" ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)) : new Date(from.getTime() - days * DAY);
  const dates = Array.from({ length: days }, (_, i) => isoDay(new Date(from.getTime() + i * DAY)));
  const prevDates = Array.from({ length: days }, (_, i) => isoDay(new Date(prevFrom.getTime() + i * DAY)));
  return { dates, prevDates, from: dates[0], prevFrom: prevDates[0], to: dates.at(-1)! };
}

type OrderRow = { paid_at: string; total_cents: number; status: string; order_items: { quantity: number; products: { name: string } | null }[] };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sin_permiso?: string; periodo?: string }> }) {
  const sp = await searchParams;
  const key: PeriodKey = sp.periodo && sp.periodo in PERIODS ? (sp.periodo as PeriodKey) : "mes";
  const p = periods(key);
  const staff = await getStaff();
  const supabase = await createClient();
  const tenDaysAgo = isoDay(new Date(Date.now() - 10 * DAY));

  const [ordersRes, viewsRes, adsRes, products, recs, offers, samples, approvals, unverified] = await Promise.all([
    supabase.from("orders").select("paid_at, total_cents, status, order_items(quantity, products(name))")
      .gte("paid_at", p.prevFrom).lte("paid_at", `${p.to}T23:59:59Z`).not("status", "in", "(pendiente_pago,cancelado)"),
    supabase.from("page_views").select("at, session_id").gte("at", p.prevFrom).limit(50000),
    supabase.from("ad_metrics_daily").select("day, spend_cents").gte("day", p.prevFrom),
    supabase.from("products").select("id, code, name, status, publish_status, price_cents, legal_red_flag, gpsr_manufacturer, gpsr_address, gpsr_contact")
      .not("status", "in", "(descartado,idea)").order("code"),
    supabase.from("recommendations").select("product_id, decision, confidence, reasons, status, metrics").in("status", ["pendiente", "aceptada"]),
    supabase.from("supplier_offers").select("measured_days, promised_days, products(code, name), suppliers(name)").not("measured_days", "is", null),
    supabase.from("samples").select("code, ordered_at, products(code, name)").eq("status", "pedida").lte("ordered_at", tenDaysAgo),
    supabase.from("approvals").select("*", { count: "exact", head: true }).eq("status", "pendiente"),
    supabase.from("settings").select("*", { count: "exact", head: true }).eq("verified", false),
  ]);

  const orders = (ordersRes.data ?? []) as unknown as OrderRow[];
  const seesSales = !ordersRes.error;
  const inSet = (set: string[]) => (d: string) => set.includes(d.slice(0, 10));
  const cur = orders.filter((o) => inSet(p.dates)(o.paid_at));
  const prev = orders.filter((o) => inSet(p.prevDates)(o.paid_at));
  const sum = (rows: OrderRow[]) => rows.reduce((s, o) => s + o.total_cents, 0);
  const daily = (rows: OrderRow[], dates: string[], f: (r: OrderRow[]) => number) => dates.map((d) => f(rows.filter((o) => o.paid_at.startsWith(d))));
  const sessions = (dates: string[]) => new Set((viewsRes.data ?? []).filter((v) => inSet(dates)(v.at)).map((v) => v.session_id)).size;
  const sessionsDaily = p.dates.map((d) => new Set((viewsRes.data ?? []).filter((v) => v.at.startsWith(d)).map((v) => v.session_id)).size);
  const prevSessionsDaily = p.prevDates.map((d) => new Set((viewsRes.data ?? []).filter((v) => v.at.startsWith(d)).map((v) => v.session_id)).size);
  const spend = (dates: string[]) => (adsRes.data ?? []).filter((a) => dates.includes(a.day)).reduce((s, a) => s + a.spend_cents, 0);

  const revenueNow = sum(cur);
  const revenuePrev = sum(prev);
  const aov = (rows: OrderRow[]) => (rows.length ? sum(rows) / rows.length : 0);
  const sessNow = sessions(p.dates);
  const sessPrev = sessions(p.prevDates);
  const conv = (o: number, s: number) => (s ? (o / s) * 100 : 0);

  const units = new Map<string, number>();
  for (const o of cur) for (const i of o.order_items) {
    const n = i.products?.name ?? "—";
    units.set(n, (units.get(n) ?? 0) + i.quantity);
  }
  const popular = [...units.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));
  const labels = p.dates.map((d) => d.slice(8));

  const kpis = [
    { label: "Ventas", value: seesSales ? eur(revenueNow) : "—", now: revenueNow, before: revenuePrev },
    { label: "Pedidos", value: seesSales ? String(cur.length) : "—", now: cur.length, before: prev.length },
    { label: "Ticket medio", value: seesSales ? eur(Math.round(aov(cur))) : "—", now: aov(cur), before: aov(prev) },
    { label: "Visitantes", value: String(sessNow), now: sessNow, before: sessPrev },
    { label: "Conversión", value: `${conv(cur.length, sessNow).toFixed(2).replace(".", ",")} %`, now: conv(cur.length, sessNow), before: conv(prev.length, sessPrev) },
    { label: "Gasto en anuncios", value: adsRes.error ? "—" : eur(spend(p.dates)), now: spend(p.dates), before: spend(p.prevDates) },
  ];

  // ---------- Alerts and products in play ----------
  const recFor = (id: string) => recs.data?.find((r) => r.product_id === id);
  type Alert = { tone: "danger" | "neutral"; text: string; href: string };
  const alerts: Alert[] = [];
  for (const pr of products.data ?? []) {
    const r = recFor(pr.id);
    const m = r?.metrics as { spendCents?: number; testCapCents?: number | null; purchases?: number } | undefined;
    if (m?.testCapCents && (m.spendCents ?? 0) >= m.testCapCents && (m.purchases ?? 0) === 0)
      alerts.push({ tone: "danger", text: `${pr.code} ${pr.name}: tope de test superado sin ventas`, href: "/admin/decisiones" });
    if (r?.decision === "matar" && r.status === "pendiente")
      alerts.push({ tone: "danger", text: `${pr.code} ${pr.name}: el motor recomienda MATAR`, href: "/admin/decisiones" });
    if (pr.legal_red_flag) alerts.push({ tone: "danger", text: `${pr.code} ${pr.name}: bandera roja legal`, href: `/admin/productos/${pr.code}#legal` });
    if (pr.publish_status === "publicado" && !(pr.gpsr_manufacturer && pr.gpsr_address && pr.gpsr_contact))
      alerts.push({ tone: "danger", text: `${pr.code} ${pr.name}: publicado sin datos GPSR completos`, href: `/admin/productos/${pr.code}#datos` });
  }
  for (const o of offers.data ?? []) {
    if (o.promised_days && o.measured_days > o.promised_days) {
      const prod = o.products as unknown as { code: string } | null;
      const sup = o.suppliers as unknown as { name: string } | null;
      alerts.push({ tone: "neutral", text: `${sup?.name}: plazo real ${o.measured_days} d frente a ${o.promised_days} d (${prod?.code})`, href: `/admin/productos/${prod?.code}#proveedores` });
    }
  }
  for (const s of samples.data ?? []) {
    const prod = s.products as unknown as { code: string; name: string } | null;
    alerts.push({ tone: "neutral", text: `Muestra ${s.code} (${prod?.name}) pedida hace más de 10 días`, href: `/admin/productos/${prod?.code}#muestras` });
  }
  if ((approvals.count ?? 0) > 0) alerts.push({ tone: "neutral", text: `${approvals.count} solicitud(es) pendientes de aprobación`, href: "/admin/aprobaciones" });
  if ((unverified.count ?? 0) > 0) alerts.push({ tone: "neutral", text: `${unverified.count} parámetro(s) de plataforma «a verificar»`, href: "/admin/ajustes" });

  const today = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date());
  const firstName = (staff?.name || "").split(" ")[0];
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hola{firstName ? `, ${firstName}` : ""} 👋</h1>
          <p className="text-sm text-muted">{todayLabel}</p>
        </div>
        <nav className="flex gap-1 rounded-xl border border-border bg-surface p-1 text-sm">
          {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
            <Link key={k} href={`/admin?periodo=${k}`} className={`rounded-lg px-3 py-1.5 ${k === key ? "bg-[#0e0e0d] text-white" : "text-muted hover:text-foreground"}`}>
              {PERIODS[k]}
            </Link>
          ))}
        </nav>
      </header>
      {sp.sin_permiso && <Notice tone="danger">No tienes permiso para abrir esa sección.</Notice>}

      <section className="grid divide-border overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-3 sm:divide-x xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="border-b border-border p-5 xl:border-b-0">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{k.value}</p>
            <div className="mt-1"><Delta now={k.now} before={k.before} /></div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Ingresos" actions={
          <span className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#111318]" />Periodo actual</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#c9ccd3]" />Anterior</span>
          </span>
        }>
          <p className="mb-3 text-3xl font-semibold tabular-nums tracking-tight">{seesSales ? eur(revenueNow) : "—"} <span className="ml-1 align-middle"><Delta now={revenueNow} before={revenuePrev} /></span></p>
          <LineChart label="Ingresos por día" labels={labels} current={daily(cur, p.dates, sum)} previous={daily(prev, p.prevDates, sum)} fmt={shortEur} />
        </Card>
        <Card title="Productos más vendidos" actions={<Link href="/admin/dinero" className="text-xs font-medium underline-offset-4 hover:underline">Ver más</Link>}>
          <RankBars rows={popular} fmt={(n) => `${n} ud.`} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Ticket medio por día">
          <p className="mb-3 text-2xl font-semibold tabular-nums">{seesSales ? eur(Math.round(aov(cur))) : "—"} <span className="ml-1 align-middle"><Delta now={aov(cur)} before={aov(prev)} /></span></p>
          <BarChart label="Ticket medio por día" labels={labels} values={daily(cur, p.dates, (r) => aov(r))} fmt={shortEur} showAvg />
        </Card>
        <Card title="Visitantes por día" actions={<Link href="/admin/visitas" className="text-xs font-medium underline-offset-4 hover:underline">Ver más</Link>}>
          <p className="mb-3 text-2xl font-semibold tabular-nums">{sessNow} <span className="ml-1 align-middle"><Delta now={sessNow} before={sessPrev} /></span></p>
          <BarChart label="Visitantes por día" labels={labels} values={sessionsDaily} previous={prevSessionsDaily} fmt={(n) => String(Math.round(n))} color="#111318" />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Productos en juego" actions={<Link href="/admin/decisiones" className="text-xs font-medium underline-offset-4 hover:underline">Ver decisiones</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="p-2 font-normal">Producto</th><th className="p-2 font-normal">Estado</th><th className="p-2 font-normal">ROAS</th><th className="p-2 font-normal">Recomendación</th></tr>
              </thead>
              <tbody>
                {(products.data ?? []).map((pr) => {
                  const r = recFor(pr.id);
                  const m = r?.metrics as { roas?: number | null } | undefined;
                  return (
                    <tr key={pr.code} className="border-t border-border">
                      <td className="p-2"><Link href={`/admin/productos/${pr.code}`} className="font-medium hover:text-gold">{pr.name}</Link><span className="ml-2 font-mono text-xs text-muted">{pr.code}</span></td>
                      <td className="p-2">{statusLabel(pr.status)}</td>
                      <td className="p-2 tabular-nums">{m?.roas != null ? m.roas.toFixed(2).replace(".", ",") : "—"}</td>
                      <td className="p-2">{r ? <DecisionBadge decision={r.decision} /> : <span className="text-xs text-muted">sin datos</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={`Alertas (${alerts.length})`}>
          {alerts.length === 0 ? <p className="text-sm text-muted">Todo en orden.</p> : (
            <ul className="space-y-2 text-sm">
              {alerts.map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className={`flex gap-2 rounded-xl px-3 py-2 hover:bg-background ${a.tone === "danger" ? "bg-[#fef3f2] text-danger" : "bg-background"}`}>
                    <span>{a.tone === "danger" ? "●" : "○"}</span>{a.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
