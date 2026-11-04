import Link from "next/link";
import { Badge, Card, Field, Notice, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { loadSettings, requireRole } from "@/lib/admin";
import { centsToInput, date, eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createTicket, updateDispute, updateReturn, updateTicket } from "../pedidos/actions";

export const metadata = { title: "Soporte" };

const TYPES = ["retraso", "danado", "no_esperado", "devolucion", "reembolso", "disputa", "pregunta", "otro"];

const TEMPLATES: Record<string, string> = {
  Retraso: "Hola [nombre], sentimos el retraso de tu pedido #[nº]. Lo hemos revisado con el almacén y el seguimiento es [nº seguimiento]. La entrega estimada es [fecha]. Si no llega antes, te ofrecemos el reembolso completo.",
  "Producto dañado": "Hola [nombre], sentimos mucho que tu pedido haya llegado dañado. ¿Puedes enviarnos una foto del producto y del embalaje? En cuanto la recibamos te enviamos uno nuevo o te devolvemos el importe, como prefieras.",
  Devolución: "Hola [nombre], puedes devolver tu pedido dentro de los 14 días desde la entrega. Envíalo a: [dirección de devolución en la UE]. Cuando lo recibamos, te reembolsaremos [importe] en el mismo método de pago en un máximo de 14 días.",
  Reembolso: "Hola [nombre], hemos tramitado el reembolso de [importe] a tu método de pago. Según tu banco, puede tardar de 5 a 10 días hábiles en aparecer.",
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; pedido?: string }> }) {
  const staff = await requireRole("owner", "operaciones", "finanzas");
  const { ok, error, pedido } = await searchParams;
  const supabase = await createClient();
  const [{ data: tickets }, { data: returns }, { data: disputes }, { count: paidOrders }, settings] = await Promise.all([
    supabase.from("tickets").select("*, orders(number)").order("status").order("created_at", { ascending: false }).limit(100),
    supabase.from("returns").select("*, orders(number), products(name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("disputes").select("*, orders(number)").order("opened_at", { ascending: false }).limit(100),
    supabase.from("orders").select("*", { count: "exact", head: true }).not("paid_at", "is", null),
    loadSettings(),
  ]);
  const slaHours = Number(settings.support_sla_hours ?? 24);
  const alertRatio = Number(settings.chargeback_alert_ratio ?? 0.0075);
  const chargebackRatio = paidOrders ? (disputes?.length ?? 0) / paidOrders : 0;
  const canEdit = staff.role === "owner" || staff.role === "operaciones";
  const overdue = (t: { status: string; first_response_at: string | null; created_at: string }) =>
    t.status === "abierto" && !t.first_response_at && Date.now() - new Date(t.created_at).getTime() > slaHours * 36e5;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Soporte</h1>
        <p className="text-sm text-muted">Incidencias, devoluciones y disputas · respuesta en menos de {slaHours} h</p>
      </header>
      <Toast ok={ok} error={error} />
      {chargebackRatio > alertRatio && (
        <Notice tone="danger">
          Ratio de contracargos {(chargebackRatio * 100).toFixed(2).replace(".", ",")} % (alerta en {(alertRatio * 100).toFixed(2).replace(".", ",")} %):
          revisa descripciones, plazos y reembolsos rápidos antes de que la pasarela penalice la cuenta.
        </Notice>
      )}

      <Card title={`Incidencias (${tickets?.filter((t) => t.status !== "resuelto").length ?? 0} abiertas)`}>
        <ul className="space-y-3">
          {(tickets ?? []).map((t) => (
            <li key={t.id} className={`rounded-md border p-3 text-sm ${overdue(t) ? "border-danger" : "border-border"}`}>
              <p>
                <strong>#{t.number}</strong> · {t.subject} · <Badge>{t.type.replaceAll("_", " ")}</Badge>
                {t.orders && <> · <Link href={`/admin/pedidos/${t.orders.number}`} className="hover:text-gold">pedido #{t.orders.number}</Link></>}
                {overdue(t) && <span className="ml-2 text-danger">● fuera de SLA</span>}
              </p>
              <p className="text-xs text-muted">abierta {date(t.created_at)} · {t.customer_email ?? "sin email"} · primera respuesta {t.first_response_at ? date(t.first_response_at) : "pendiente"}</p>
              {canEdit && (
                <form action={updateTicket.bind(null, t.id)} className="mt-2 flex flex-wrap items-center gap-2">
                  <input name="notes" defaultValue={t.notes} placeholder="Notas internas" className={`${input} mt-0 flex-1`} aria-label="Notas" />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="responded" defaultChecked={Boolean(t.first_response_at)} /> respondida</label>
                  <select name="status" defaultValue={t.status} className={`${input} mt-0 w-44`} aria-label="Estado">
                    <option value="abierto">abierto</option><option value="esperando_cliente">esperando cliente</option><option value="resuelto">resuelto</option>
                  </select>
                  <button className={btnGhost}>Guardar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form action={createTicket} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-5">
            <Field label="Pedido nº"><input name="order_number" defaultValue={pedido ?? ""} inputMode="numeric" className={input} /></Field>
            <Field label="Tipo"><select name="type" className={input}>{TYPES.map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Asunto"><input name="subject" required className={input} /></Field></div>
            <Field label="Email del cliente"><input name="customer_email" type="email" className={input} /></Field>
            <div className="sm:col-span-4"><Field label="Notas"><input name="notes" className={input} /></Field></div>
            <div className="self-end"><button className={btn}>Abrir incidencia</button></div>
          </form>
        )}
      </Card>

      <Card title="Devoluciones">
        <Table head={["Pedido", "Producto", "Motivo", "Solicitada", "Reembolso (IVA incl.)", "Coste nuestro", "Estado", ""]}>
          {(returns ?? []).map((r) => (
            <tr key={r.id}>
              <td><Link href={`/admin/pedidos/${r.orders?.number}`} className="hover:text-gold">#{r.orders?.number}</Link></td>
              <td>{r.products?.name ?? "—"}</td>
              <td>{r.reason}</td>
              <td>{date(r.requested_at)}</td>
              {canEdit ? (
                <td colSpan={4}>
                  <form action={updateReturn.bind(null, r.id)} className="flex flex-wrap gap-1">
                    <input name="refund" defaultValue={centsToInput(r.refund_cents)} inputMode="decimal" className={`${input} mt-0 w-24`} aria-label="Reembolso" />
                    <input name="return_cost" defaultValue={centsToInput(r.return_cost_cents)} inputMode="decimal" className={`${input} mt-0 w-24`} aria-label="Coste nuestro" />
                    <select name="status" defaultValue={r.status} className={`${input} mt-0 w-32`} aria-label="Estado">
                      {["solicitada", "aprobada", "recibida", "reembolsada", "rechazada"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <button className={btnGhost}>OK</button>
                  </form>
                </td>
              ) : (
                <><td className="tabular-nums">{eur(r.refund_cents)}</td><td className="tabular-nums">{eur(r.return_cost_cents)}</td><td>{r.status}</td><td /></>
              )}
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-muted">Las devoluciones se registran desde el pedido. Al marcar «reembolsada» por el total, el pedido pasa a «reembolsado».</p>
      </Card>

      <Card title={`Disputas / contracargos · ratio ${(chargebackRatio * 100).toFixed(2).replace(".", ",")} %`}>
        <Table head={["Pedido", "Motivo", "Abierta", "Importe", "Comisión", "Estado"]}>
          {(disputes ?? []).map((d) => (
            <tr key={d.id}>
              <td><Link href={`/admin/pedidos/${d.orders?.number}`} className="hover:text-gold">#{d.orders?.number}</Link></td>
              <td>{d.reason}</td>
              <td>{date(d.opened_at)}</td>
              <td className="tabular-nums">{eur(d.amount_cents)}</td>
              <td className="tabular-nums">{eur(d.fee_cents)}</td>
              <td>
                <form action={updateDispute.bind(null, d.id)} className="flex gap-1">
                  <select name="status" defaultValue={d.status} className={`${input} mt-0 w-28 py-1`} aria-label="Estado de la disputa">
                    <option>abierta</option><option>ganada</option><option>perdida</option>
                  </select>
                  <button className={btnGhost}>OK</button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Plantillas de respuesta">
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(TEMPLATES).map(([k, v]) => (
            <div key={k}><p className="text-sm font-semibold">{k}</p><pre className="whitespace-pre-wrap rounded-md border border-border p-2 text-xs">{v}</pre></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">MEROVAN no envía correos: copia, personaliza y responde desde tu buzón.</p>
      </Card>
    </div>
  );
}
