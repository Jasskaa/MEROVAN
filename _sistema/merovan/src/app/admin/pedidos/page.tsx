import Link from "next/link";
import { Badge, Card, Field, Table, Toast, btn, input } from "@/components/ui";
import { loadSettings, requireRole } from "@/lib/admin";
import { date, eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createManualOrder } from "./actions";

export const metadata = { title: "Pedidos" };

const STATUS_TONE: Record<string, "ok" | "danger" | "gold" | "neutral"> = {
  pagado: "gold", enviado_proveedor: "gold", enviado: "neutral", entregado: "ok", reembolsado: "danger", cancelado: "danger",
};
const STATUSES = ["pagado", "enviado_proveedor", "enviado", "entregado", "reembolsado", "cancelado", "pendiente_pago"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; estado?: string; canal?: string }> }) {
  const staff = await requireRole("owner", "operaciones", "finanzas");
  const { ok, error, estado, canal } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("orders")
    .select("id, number, channel, status, customer_name, shipping_country, total_cents, paid_at, created_at, promised_delivery_on, tracking_number, external_ref, supplier_orders(status, tracking_number), order_items(quantity, products(code))")
    .order("number", { ascending: false }).limit(200);
  q = estado ? q.eq("status", estado) : q.neq("status", "pendiente_pago");
  if (canal) q = q.eq("channel", canal);
  const [{ data: orders }, settings, { data: paymentIssues }] = await Promise.all([
    q, loadSettings(),
    supabase.from("payment_events").select("id, outcome, event_ref, amount_cents, created_at, orders(number)")
      .is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
  ]);
  const trackingDays = Number(settings.tracking_alert_days ?? 5);
  const today = new Date().toISOString().slice(0, 10);

  const alertFor = (o: NonNullable<typeof orders>[number]) => {
    if (!o.paid_at || ["entregado", "reembolsado", "cancelado"].includes(o.status)) return null;
    const so = o.supplier_orders as unknown as { status: string; tracking_number: string | null } | null;
    const ageDays = (Date.now() - new Date(o.paid_at).getTime()) / 864e5;
    if (!so || so.status === "pendiente") return ageDays > 1 ? "sin pedir al proveedor" : null;
    if (!(so.tracking_number || o.tracking_number) && ageDays > trackingDays) return `sin seguimiento tras ${trackingDays} días`;
    if (o.promised_delivery_on && o.promised_delivery_on < today) return "fuera de plazo";
    return null;
  };
  const late = (orders ?? []).filter(alertFor);
  const canEdit = staff.role === "owner" || staff.role === "operaciones";
  const filter = (k: string, v?: string) => {
    const p = new URLSearchParams({ ...(estado ? { estado } : {}), ...(canal ? { canal } : {}) });
    if (v) p.set(k, v); else p.delete(k);
    return `?${p}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
        <p className="text-sm text-muted">{orders?.length ?? 0} pedidos{late.length ? ` · ${late.length} con aviso` : ""}</p>
      </header>
      <Toast ok={ok} error={error} />

      {!!paymentIssues?.length && (
        <Card title={`Pagos por revisar (${paymentIssues.length})`}>
          <p className="mb-2 text-sm text-muted">Cobros que Stripe confirmó pero no se han podido aplicar a un pedido. Revísalos en Stripe y, si toca, reembolsa.</p>
          <Table head={["Fecha", "Motivo", "Pedido", "Importe", "Sesión de Stripe"]}>
            {paymentIssues.map((e) => (
              <tr key={e.id}>
                <td>{date(e.created_at)}</td>
                <td><Badge tone="danger">{e.outcome.replaceAll("_", " ")}</Badge></td>
                <td>{(e.orders as unknown as { number: number } | null)?.number ?? "—"}</td>
                <td className="tabular-nums">{e.amount_cents != null ? eur(e.amount_cents) : "—"}</td>
                <td className="font-mono text-xs">{e.event_ref ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <nav className="flex flex-wrap gap-1 text-sm">
        <a href={filter("estado")} className={`rounded-md border px-3 py-1 ${!estado ? "border-gold text-gold" : "border-border"}`}>Todos</a>
        {STATUSES.map((s) => (
          <a key={s} href={filter("estado", s)} className={`rounded-md border px-3 py-1 ${estado === s ? "border-gold text-gold" : "border-border"}`}>{s.replaceAll("_", " ")}</a>
        ))}
        <span className="mx-2" />
        {["web", "tiktok_shop"].map((c) => (
          <a key={c} href={filter("canal", canal === c ? undefined : c)} className={`rounded-md border px-3 py-1 ${canal === c ? "border-gold text-gold" : "border-border"}`}>{c}</a>
        ))}
      </nav>

      <Card title="Listado">
        <Table head={["Nº", "Fecha", "Canal", "Cliente", "Productos", "Total", "Estado", "Proveedor", "Aviso"]}>
          {(orders ?? []).map((o) => {
            const so = o.supplier_orders as unknown as { status: string } | null;
            const warn = alertFor(o);
            return (
              <tr key={o.id}>
                <td><Link href={`/admin/pedidos/${o.number}`} className="font-semibold hover:text-gold">#{o.number}</Link></td>
                <td>{date(o.paid_at ?? o.created_at)}</td>
                <td>{o.channel}{o.external_ref && <span className="block text-xs text-muted">{o.external_ref}</span>}</td>
                <td>{o.customer_name ?? "—"} <span className="text-xs text-muted">{o.shipping_country}</span></td>
                <td className="text-xs">{(o.order_items ?? []).map((i) => `${i.quantity}× ${(i.products as unknown as { code: string })?.code}`).join(", ")}</td>
                <td className="tabular-nums">{eur(o.total_cents)}</td>
                <td><Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status.replaceAll("_", " ")}</Badge></td>
                <td>{so?.status ?? "pendiente"}</td>
                <td className="text-danger">{warn ?? ""}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {canEdit && (
        <Card title="Registrar pedido de TikTok Shop">
          <form action={createManualOrder} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="channel" value="tiktok_shop" />
            <Field label="Nº de pedido en TikTok"><input name="external_ref" required className={input} /></Field>
            <Field label="SKU"><input name="sku" required className={input} /></Field>
            <Field label="Unidades"><input name="quantity" type="number" min={1} defaultValue={1} className={input} /></Field>
            <Field label="Precio unitario (IVA incl.)"><input name="unit_price" required inputMode="decimal" className={input} /></Field>
            <Field label="Cliente" hint="nombre, opcional"><input name="customer_name" className={input} /></Field>
            <Field label="País"><input name="country" defaultValue="ES" maxLength={2} className={input} /></Field>
            <Field label="Fecha de pago"><input name="paid_on" type="date" defaultValue={today} className={input} /></Field>
            <div className="self-end"><button className={btn}>Registrar</button></div>
          </form>
          <p className="mt-2 text-xs text-muted">La comisión de TikTok Shop se calcula con el % de Ajustes. Los pedidos de la web entran solos al pagarse.</p>
        </Card>
      )}
    </div>
  );
}
