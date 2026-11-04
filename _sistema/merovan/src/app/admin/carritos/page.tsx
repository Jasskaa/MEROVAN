import { Badge, Card, Table } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { date, eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Carritos" };

const TONE = { activo: "gold", abandonado: "danger", convertido: "ok" } as const;

export default async function CartsPage() {
  await requireRole();
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: carts } = await supabase
    .from("cart_overview")
    .select("*")
    .gt("items", 0)
    .gte("created_at", since)
    .order("updated_at", { ascending: false })
    .limit(200);

  const rows = carts ?? [];
  const sum = (s: string) => rows.filter((c) => c.status === s);
  const kpis = (["activo", "abandonado", "convertido"] as const).map((s) => ({
    s, n: sum(s).length, value: sum(s).reduce((t, c) => t + c.value_cents, 0),
  }));
  const conversion = rows.length ? (sum("convertido").length / rows.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Carritos</h1>
        <p className="text-sm text-muted">Últimos 30 días · un carrito se considera abandonado tras el tiempo fijado en Ajustes</p>
      </header>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.s} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs capitalize text-muted">{k.s}s</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.n}</p>
            <p className="text-xs tabular-nums text-muted">{eur(k.value)}</p>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">Carrito → compra</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{conversion.toFixed(1).replace(".", ",")} %</p>
        </div>
      </section>
      <Card title="Detalle">
        <Table head={["Creado", "Última actividad", "Estado", "Unidades", "Valor"]}>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{date(c.created_at)}</td>
              <td>{new Date(c.updated_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</td>
              <td><Badge tone={TONE[c.status as keyof typeof TONE]}>{c.status}</Badge></td>
              <td className="tabular-nums">{c.items}</td>
              <td className="tabular-nums">{eur(c.value_cents)}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-muted">Los carritos son anónimos: no se guarda quién es el visitante hasta que paga.</p>
      </Card>
    </div>
  );
}
