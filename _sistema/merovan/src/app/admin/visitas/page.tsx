import { Card, Table } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Visitas" };

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")} %` : "—");

function top<T>(items: T[], key: (t: T) => string | null, n = 10) {
  const counts = new Map<string, number>();
  for (const i of items) {
    const k = key(i) ?? "(directo)";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const host = (url: string | null) => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requireRole();
  const days = Math.min(90, Math.max(1, Number((await searchParams).dias ?? 7)));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const supabase = await createClient();

  const [views, carts, orders, products] = await Promise.all([
    supabase.from("page_views").select("at, path, product_id, session_id, referrer, utm_source, utm_campaign").gte("at", since).limit(10000),
    supabase.from("cart_overview").select("session_id, items").gte("created_at", since).gt("items", 0),
    supabase.from("daily_sales").select("orders").gte("day", since.slice(0, 10)),
    supabase.from("products").select("id, code, name"),
  ]);
  const v = views.data ?? [];
  const sessions = new Set(v.map((x) => x.session_id)).size;
  const cartSessions = new Set((carts.data ?? []).map((c) => c.session_id)).size;
  const paid = (orders.data ?? []).reduce((s, o) => s + Number(o.orders), 0);

  const byDay = top(v, (x) => x.at.slice(0, 10), 90).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDay = Math.max(1, ...byDay.map((d) => d[1]));
  const byProduct = top(v.filter((x) => x.product_id), (x) => x.product_id);
  const productName = (id: string) => products.data?.find((p) => p.id === id);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Visitas</h1>
          <p className="text-sm text-muted">Visitas anónimas a la tienda · últimos {days} días</p>
        </div>
        <nav className="flex gap-1 text-sm">
          {[1, 7, 30, 90].map((d) => (
            <a key={d} href={`?dias=${d}`} className={`rounded-md border px-3 py-1 ${d === days ? "border-gold text-gold" : "border-border"}`}>{d} d</a>
          ))}
        </nav>
      </header>

      <Card title="Embudo">
        <ol className="grid gap-3 sm:grid-cols-4">
          {[
            { l: "Páginas vistas", n: v.length, r: "" },
            { l: "Visitantes", n: sessions, r: "" },
            { l: "Añadieron al carrito", n: cartSessions, r: pct(cartSessions, sessions) },
            { l: "Compraron", n: paid, r: pct(paid, sessions) },
          ].map((s) => (
            <li key={s.l} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted">{s.l}</p>
              <p className="text-2xl font-semibold tabular-nums">{s.n}</p>
              {s.r && <p className="text-xs text-gold">{s.r} de los visitantes</p>}
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Por día">
        {byDay.length === 0 ? <p className="text-sm text-muted">Sin visitas en este periodo.</p> : (
          <div className="flex h-40 items-end gap-1" role="img" aria-label="Páginas vistas por día">
            {byDay.map(([d, n]) => (
              <div key={d} className="flex h-full max-w-16 flex-1 flex-col items-center justify-end gap-1" title={`${d}: ${n}`}>
                <span className="text-[10px] tabular-nums text-muted">{n}</span>
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-gold" style={{ height: `${(n / maxDay) * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted">{d.slice(8)}/{d.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Productos más vistos">
          <Table head={["Producto", "Vistas"]}>
            {byProduct.map(([id, n]) => (
              <tr key={id}><td>{productName(id)?.name ?? id}</td><td className="tabular-nums">{n}</td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Procedencia">
          <Table head={["Origen", "Vistas"]}>
            {top(v, (x) => host(x.referrer)).map(([k, n]) => <tr key={k}><td>{k}</td><td className="tabular-nums">{n}</td></tr>)}
          </Table>
        </Card>
        <Card title="Campañas (UTM)">
          <Table head={["Fuente / campaña", "Vistas"]}>
            {top(v.filter((x) => x.utm_source), (x) => `${x.utm_source} / ${x.utm_campaign ?? "—"}`).map(([k, n]) => (
              <tr key={k}><td>{k}</td><td className="tabular-nums">{n}</td></tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted">Añade ?utm_source=tiktok&amp;utm_campaign=… a los enlaces de tus anuncios.</p>
        </Card>
      </div>
    </div>
  );
}
