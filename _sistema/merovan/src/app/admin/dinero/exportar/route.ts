import { NextResponse } from "next/server";
import { audit } from "@/lib/admin";
import { toCsv } from "@/lib/domain/csv";
import { loadFinance, period } from "@/lib/finance";
import { createClient, getStaff } from "@/lib/supabase/server";

const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");

// CSV exports for the gestoría. Personal data is limited to what an invoice needs (order number, country).
export async function GET(request: Request) {
  const staff = await getStaff();
  if (!staff || !["owner", "finanzas"].includes(staff.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const url = new URL(request.url);
  const type = url.searchParams.get("tipo") ?? "ventas";
  const { from, to } = period(url.searchParams.get("desde") ?? undefined, url.searchParams.get("hasta") ?? undefined);
  const supabase = await createClient();
  const { rows, expenses } = await loadFinance(supabase, from, to);

  let header: string[];
  let data: unknown[][];
  if (type === "ventas") {
    header = ["fecha", "pedido", "canal", "ref_externa", "pais", "estado", "base_eur", "iva_eur", "total_eur"];
    data = rows.map((o) => [o.paid_at.slice(0, 10), o.number, o.channel, o.external_ref ?? "", o.shipping_country, o.status,
      euros(o.total_cents - o.vat_cents), euros(o.vat_cents), euros(o.total_cents)]);
  } else if (type === "comisiones") {
    header = ["fecha", "pedido", "canal", "comision_canal_eur", "comision_pago_eur", "ref_pago"];
    data = rows.map((o) => [o.paid_at.slice(0, 10), o.number, o.channel, euros(o.platform_fee_cents), euros(o.payment_fee_cents), o.payment_ref ?? ""]);
  } else if (type === "reembolsos") {
    header = ["fecha_pedido", "pedido", "estado_devolucion", "reembolso_eur", "coste_devolucion_eur", "disputa", "importe_disputa_eur"];
    data = rows.flatMap((o) => [
      ...o.returns.map((r) => [o.paid_at.slice(0, 10), o.number, r.status, euros(r.refund_cents), euros(r.return_cost_cents), "", ""]),
      ...o.disputes.map((d) => [o.paid_at.slice(0, 10), o.number, "", "", "", d.status, euros(d.amount_cents + d.fee_cents)]),
    ]);
  } else if (type === "gastos") {
    header = ["fecha", "categoria", "concepto", "proveedor", "base_eur", "iva_eur", "justificante"];
    data = expenses.map((e) => [e.spent_on, e.category, e.description, e.vendor ?? "", euros(e.amount_cents), euros(e.vat_cents), e.receipt_path ? "sí" : "no"]);
  } else {
    return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
  }

  await audit("exportar_gestoria", "finance", type, { from, to, rows: data.length });
  return new NextResponse(toCsv(header, data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="merovan-${type}-${from}-${to}.csv"`,
    },
  });
}
