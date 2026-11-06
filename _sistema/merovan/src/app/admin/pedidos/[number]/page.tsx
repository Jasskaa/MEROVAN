import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Field, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { centsToInput, date, eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createDispute, createReturn, saveSupplierOrder } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Pedido #${(await params).number}` };
}

const SUPPLIER_STATUSES = ["pendiente", "pedido", "enviado", "entregado", "incidencia", "cancelado"];

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "operaciones", "finanzas");
  const { number } = await params;
  const { ok, error } = await searchParams;
  if (!/^\d+$/.test(number)) notFound();
  const supabase = await createClient();
  const { data: o } = await supabase.from("orders")
    .select("*, order_items(id, quantity, unit_price_cents, unit_cost_cents, product_id, products(code, name), product_variants(sku, title)), supplier_orders(*), returns(*), disputes(*), tickets(number, subject, status)")
    .eq("number", Number(number)).single();
  if (!o) notFound();
  const { data: suppliers } = await supabase.from("suppliers").select("id, code, name").order("code");

  const so = o.supplier_orders as unknown as Record<string, string | number | null> | null;
  const items = o.order_items ?? [];
  const costEstimate = items.reduce((s: number, i: { unit_cost_cents: number | null; quantity: number }) => s + (i.unit_cost_cents ?? 0) * i.quantity, 0);
  const canEdit = staff.role === "owner" || staff.role === "operaciones";
  // Delivery address saved from Stripe (orders before 06/11/2026 have none).
  const address = o.ship_line1
    ? [o.ship_name ?? o.customer_name, o.ship_line1, o.ship_line2, [o.ship_postal_code, o.ship_city].filter(Boolean).join(" "), o.ship_state, o.shipping_country, o.ship_phone && `tel. ${o.ship_phone}`]
        .filter(Boolean).join(" · ")
    : null;
  const daysSincePaid =o.paid_at ? Math.floor((Date.now() - new Date(o.paid_at).getTime()) / 864e5) : null;
  const supplierText = [
    `Pedido MEROVAN #${o.number}`,
    ...items.map((i: { quantity: number; product_variants: { sku: string } | null; products: { name: string } }) => `${i.quantity} × ${i.product_variants?.sku ?? ""} ${i.products.name}`),
    `Enviar a: ${address ?? `${o.customer_name ?? "[nombre]"} · [dirección no guardada: consúltala en Stripe/TikTok] · ${o.shipping_country}`}`,
  ].join("\n");

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/pedidos" className="text-xs text-muted hover:text-gold">← Pedidos</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Pedido #{o.number}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge tone="gold">{o.status.replaceAll("_", " ")}</Badge> {o.channel}{o.external_ref && ` · ${o.external_ref}`} ·
          pagado {date(o.paid_at)} · entrega prometida {date(o.promised_delivery_on)}
        </p>
      </header>
      <Toast ok={ok} error={error} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Contenido">
          <Table head={["Producto", "Uds.", "Precio", "Coste est."]}>
            {items.map((i: { id: string; quantity: number; unit_price_cents: number; unit_cost_cents: number | null; products: { code: string; name: string }; product_variants: { title: string } | null }) => (
              <tr key={i.id}>
                <td><Link href={`/admin/productos/${i.products.code}`} className="hover:text-gold">{i.products.name}</Link>
                  {i.product_variants?.title && i.product_variants.title !== "Única" && <span className="text-xs text-muted"> · {i.product_variants.title}</span>}</td>
                <td className="tabular-nums">{i.quantity}</td>
                <td className="tabular-nums">{eur(i.unit_price_cents)}</td>
                <td className="tabular-nums">{i.unit_cost_cents != null ? eur(i.unit_cost_cents) : "—"}</td>
              </tr>
            ))}
          </Table>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Total (IVA incl.)</dt><dd className="tabular-nums font-semibold">{eur(o.total_cents)}</dd></div>
            <div><dt className="text-xs text-muted">IVA</dt><dd className="tabular-nums">{eur(o.vat_cents)}</dd></div>
            <div><dt className="text-xs text-muted">Envío cobrado</dt><dd className="tabular-nums">{eur(o.shipping_cents)}</dd></div>
            <div><dt className="text-xs text-muted">Comisión canal</dt><dd className="tabular-nums">{eur(o.platform_fee_cents)}</dd></div>
            <div><dt className="text-xs text-muted">Comisión pago (est.)</dt><dd className="tabular-nums">{eur(o.payment_fee_cents)}</dd></div>
            <div><dt className="text-xs text-muted">Cliente</dt><dd>{o.customer_name ?? "—"} · {o.customer_email ?? "—"}</dd></div>
          </dl>
          <div className="mt-3 text-sm">
            <p className="text-xs text-muted">Dirección de envío</p>
            <p>{address ?? "No guardada (pedido anterior o sin dirección): consúltala en Stripe o TikTok Shop."}</p>
          </div>
        </Card>

        <Card title="Pedido al proveedor">
          {daysSincePaid != null && (!so || so.status === "pendiente") && daysSincePaid >= 1 && (
            <p className="mb-3 text-sm text-danger">Pagado hace {daysSincePaid} día(s) y aún sin pedir al proveedor.</p>
          )}
          <form action={saveSupplierOrder.bind(null, o.id, o.number)} className="grid gap-3 sm:grid-cols-2">
            <fieldset disabled={!canEdit} className="contents">
              <Field label="Proveedor">
                <select name="supplier_id" defaultValue={(so?.supplier_id as string) ?? ""} className={input}>
                  <option value="">—</option>
                  {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                </select>
              </Field>
              <Field label="Estado">
                <select name="status" defaultValue={(so?.status as string) ?? "pendiente"} className={input}>
                  {SUPPLIER_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Ref. del proveedor"><input name="supplier_ref" defaultValue={(so?.supplier_ref as string) ?? ""} className={input} /></Field>
              <Field label="Coste real (€)" hint={`estimado ${eur(costEstimate)}`}>
                <input name="cost" inputMode="decimal" defaultValue={centsToInput(so?.cost_cents as number | null)} className={input} />
              </Field>
              <Field label="Transportista"><input name="carrier" defaultValue={(so?.carrier as string) ?? ""} className={input} /></Field>
              <Field label="Nº de seguimiento"><input name="tracking_number" defaultValue={(so?.tracking_number as string) ?? ""} className={input} /></Field>
              <div className="sm:col-span-2"><Field label="Notas"><input name="notes" defaultValue={(so?.notes as string) ?? ""} className={input} /></Field></div>
            </fieldset>
            {canEdit && <div><button className={btn}>Guardar</button></div>}
          </form>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Texto para enviar el pedido al proveedor</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border p-2 text-xs">{supplierText}</pre>
          </details>
          {so && <p className="mt-2 text-xs text-muted">Pedido {date(so.ordered_at as string)} · enviado {date(so.shipped_at as string)} · entregado {date(so.delivered_at as string)}</p>}
        </Card>

        <Card title="Devoluciones">
          {(o.returns ?? []).map((r: { id: string; reason: string; status: string; refund_cents: number; return_cost_cents: number; requested_at: string }) => (
            <p key={r.id} className="text-sm">
              {date(r.requested_at)} · {r.reason} · <Badge>{r.status}</Badge> · reembolso {eur(r.refund_cents)} · coste {eur(r.return_cost_cents)}
            </p>
          ))}
          {o.paid_at && (
            <p className="my-2 text-xs text-muted">
              Desistimiento: 14 días desde la entrega{so?.delivered_at ? ` (hasta ${date(new Date(new Date(so.delivered_at as string).getTime() + 14 * 864e5).toISOString())})` : ""}.
            </p>
          )}
          {canEdit && (
            <form action={createReturn.bind(null, o.id, o.number)} className="mt-2 grid gap-2 sm:grid-cols-4">
              <select name="product_id" className={`${input} mt-0`} aria-label="Producto devuelto">
                {items.map((i: { product_id: string; products: { name: string } }) => <option key={i.product_id} value={i.product_id}>{i.products.name}</option>)}
              </select>
              <input name="reason" required placeholder="Motivo" className={`${input} mt-0`} aria-label="Motivo de la devolución" />
              <input name="refund" inputMode="decimal" placeholder="Reembolso €" className={`${input} mt-0`} aria-label="Importe a reembolsar" />
              <input name="return_cost" inputMode="decimal" placeholder="Coste nuestro €" className={`${input} mt-0`} aria-label="Coste de la devolución" />
              <button className={btnGhost}>+ Registrar devolución</button>
            </form>
          )}
        </Card>

        <Card title="Disputas e incidencias">
          {(o.disputes ?? []).map((d: { id: string; reason: string; status: string; amount_cents: number }) => (
            <p key={d.id} className="text-sm">Disputa: {d.reason} · {eur(d.amount_cents)} · <Badge tone={d.status === "perdida" ? "danger" : "neutral"}>{d.status}</Badge></p>
          ))}
          {(o.tickets ?? []).map((t: { number: number; subject: string; status: string }) => (
            <p key={t.number} className="text-sm"><Link href="/admin/soporte" className="hover:text-gold">Incidencia #{t.number}</Link> · {t.subject} · {t.status}</p>
          ))}
          <form action={createDispute.bind(null, o.id, o.number)} className="mt-2 grid gap-2 sm:grid-cols-4">
            <input name="reason" required placeholder="Motivo del contracargo" className={`${input} mt-0 sm:col-span-2`} aria-label="Motivo del contracargo" />
            <input name="amount" required inputMode="decimal" placeholder="Importe €" className={`${input} mt-0`} aria-label="Importe disputado" />
            <input name="fee" inputMode="decimal" placeholder="Comisión €" className={`${input} mt-0`} aria-label="Comisión de la disputa" />
            <button className={btnGhost}>+ Registrar disputa</button>
          </form>
          <Link href={`/admin/soporte?pedido=${o.number}`} className="mt-3 inline-block text-xs text-muted hover:text-gold">Abrir incidencia de soporte →</Link>
        </Card>
      </div>
    </div>
  );
}
