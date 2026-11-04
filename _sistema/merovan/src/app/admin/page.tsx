import { eur } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

// Weekly summary: sales, money, visits and carts (last 7 days).
export default async function Dashboard() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const sinceDay = since.slice(0, 10);

  const [sales, visits, carts, products] = await Promise.all([
    supabase.from("daily_sales").select("orders, revenue_cents").gte("day", sinceDay),
    supabase.from("page_views").select("*", { count: "exact", head: true }).gte("at", since),
    supabase.from("carts").select("status").gte("created_at", since),
    supabase.from("products").select("code, name, status, publish_status, price_cents").order("code"),
  ]);

  const orders = sales.data?.reduce((s, r) => s + Number(r.orders), 0) ?? 0;
  const revenue = sales.data?.reduce((s, r) => s + Number(r.revenue_cents), 0) ?? 0;
  const cartRows = carts.data ?? [];
  const abandoned = cartRows.filter((c) => c.status === "abandonado").length;
  const conversion = visits.count ? (orders / visits.count) * 100 : 0;

  const kpis = [
    { label: "Ingresos (IVA incl.)", value: sales.error ? "—" : eur(revenue) },
    { label: "Pedidos", value: sales.error ? "—" : String(orders) },
    { label: "Visitas", value: String(visits.count ?? 0) },
    { label: "Carritos / abandonados", value: `${cartRows.length} / ${abandoned}` },
    { label: "Conversión", value: `${conversion.toFixed(2).replace(".", ",")} %` },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Panel</h1>
        <p className="text-sm text-muted">Últimos 7 días · importes con IVA</p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl">Productos en juego</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="p-3">ID</th><th className="p-3">Producto</th><th className="p-3">Estado</th>
                <th className="p-3">Publicación</th><th className="p-3 text-right">Precio</th>
              </tr>
            </thead>
            <tbody>
              {(products.data ?? []).map((p) => (
                <tr key={p.code} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{p.code}</td>
                  <td className="p-3">{p.name}</td>
                  <td className="p-3">{p.status.replaceAll("_", " ")}</td>
                  <td className="p-3">{p.publish_status.replaceAll("_", " ")}</td>
                  <td className="p-3 text-right tabular-nums">{p.price_cents != null ? eur(p.price_cents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">La recomendación escalar / arreglar / matar llega en la Fase E.</p>
      </section>
    </div>
  );
}
