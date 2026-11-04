import Link from "next/link";
import { Badge, Card, Field, Notice, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { type ProfitLine, realProfit, vatSummary } from "@/lib/domain/profit";
import { date, eur } from "@/lib/format";
import { loadFinance, period } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { addExpense, openReceipt, updateCompliance } from "./actions";

export const metadata = { title: "Dinero" };

const CATEGORIES = ["herramientas", "creadores", "muestras", "gestoria", "publicidad", "envios", "stock", "otros"];
const HEAD = ["Pedidos", "Ventas netas", "Reembolsos", "Coste producto", "Comisión canal", "Comisión pago", "Devoluciones", "Contracargos", "Anuncios", "Beneficio", "Margen"];
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1).replace(".", ",")} %`);

function Cells({ l }: { l: ProfitLine }) {
  return (
    <>
      <td className="tabular-nums">{l.orders}</td>
      <td className="tabular-nums">{eur(l.netSalesCents)}</td>
      <td className="tabular-nums">{eur(-l.refundsCents)}</td>
      <td className="tabular-nums">{eur(-l.cogsCents)}</td>
      <td className="tabular-nums">{eur(-l.platformFeesCents)}</td>
      <td className="tabular-nums">{eur(-l.paymentFeesCents)}</td>
      <td className="tabular-nums">{eur(-l.returnCostsCents)}</td>
      <td className="tabular-nums">{eur(-l.chargebacksCents)}</td>
      <td className="tabular-nums">{eur(-l.adSpendCents)}</td>
      <td className={`tabular-nums font-semibold ${l.profitCents < 0 ? "text-danger" : "text-ok"}`}>{eur(l.profitCents)}</td>
      <td className="tabular-nums">{pct(l.marginPct)}</td>
    </>
  );
}

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; desde?: string; hasta?: string }> }) {
  await requireRole("owner", "finanzas");
  const sp = await searchParams;
  const { from, to } = period(sp.desde, sp.hasta);
  const supabase = await createClient();
  const [{ profitOrders, adSpend, expenses, products }, { data: compliance }] = await Promise.all([
    loadFinance(supabase, from, to),
    supabase.from("compliance_items").select("*").order("area").order("label"),
  ]);

  const byProduct = realProfit(profitOrders, adSpend, "product");
  const byChannel = realProfit(profitOrders, adSpend, "channel");
  const contribution = byChannel.reduce((s, l) => s + l.profitCents, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount_cents, 0);
  const netProfit = contribution - expenseTotal;
  const vat = vatSummary(profitOrders);
  const productName = (id: string) => products.get(id) ?? { code: "—", name: id };
  const qs = `desde=${from}&hasta=${to}`;
  const now = new Date();
  const months = [0, 1, 2].map((k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const label = d.toLocaleString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
    return { label: label.charAt(0).toUpperCase() + label.slice(1), from: d.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dinero</h1>
          <p className="text-sm text-muted">{date(from)} – {date(to)} · todos los importes sin IVA</p>
        </div>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          {months.map((m) => <a key={m.from} href={`?desde=${m.from}&hasta=${m.to}`} className="rounded-md border border-border px-3 py-1 hover:border-gold">{m.label}</a>)}
          <input type="date" name="desde" defaultValue={from} className={`${input} mt-0 w-36`} aria-label="Desde" />
          <input type="date" name="hasta" defaultValue={to} className={`${input} mt-0 w-36`} aria-label="Hasta" />
          <button className={btnGhost}>Ver</button>
        </form>
      </header>
      <Toast ok={sp.ok} error={sp.error} />
      <Notice>La información fiscal es de apoyo: la gestoría debe validarla. MEROVAN no presenta impuestos.</Notice>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Beneficio de contribución", contribution],
          ["Gastos generales", expenseTotal ? -expenseTotal : 0],
          ["Beneficio neto", netProfit],
          ["IVA repercutido", vat.reduce((s, v) => s + v.vatCents - v.refundVatCents, 0)],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">{l}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${(v as number) < 0 ? "text-danger" : ""}`}>{eur(v as number)}</p>
          </div>
        ))}
      </section>

      <Card title="Beneficio real por producto">
        <Table head={["Producto", ...HEAD]}>
          {byProduct.map((l) => {
            const p = productName(l.key);
            return <tr key={l.key}><td><Link href={`/admin/productos/${p.code}`} className="hover:text-gold">{p.code} · {p.name}</Link></td><Cells l={l} /></tr>;
          })}
        </Table>
      </Card>

      <Card title="Por canal">
        <Table head={["Canal", ...HEAD]}>
          {byChannel.map((l) => <tr key={l.key}><td>{l.key}</td><Cells l={l} /></tr>)}
        </Table>
        <p className="mt-2 text-xs text-muted">El gasto en anuncios va en su propia línea porque un anuncio puede vender por la web y por TikTok Shop.</p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="IVA por país y mes">
          <Table head={["Mes", "País", "Base", "IVA", "IVA devuelto"]}>
            {vat.map((v) => (
              <tr key={`${v.month}${v.country}`}>
                <td>{v.month}</td><td>{v.country}{v.country !== "ES" && <Badge tone="gold">OSS</Badge>}</td>
                <td className="tabular-nums">{eur(v.baseCents)}</td><td className="tabular-nums">{eur(v.vatCents)}</td><td className="tabular-nums">{eur(v.refundVatCents)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Exportar para la gestoría">
          <ul className="space-y-2 text-sm">
            {[["ventas", "Ventas (pedidos con IVA)"], ["comisiones", "Comisiones de canal y pago"], ["reembolsos", "Reembolsos y devoluciones"], ["gastos", "Gastos con justificante"]].map(([k, l]) => (
              <li key={k}><a href={`/admin/dinero/exportar?tipo=${k}&${qs}`} className="hover:text-gold">↓ {l} (CSV)</a></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Periodo {date(from)} – {date(to)}. Se abren en Excel con acentos correctos.</p>
        </Card>
      </div>

      <Card title={`Gastos (${eur(expenseTotal)})`}>
        <Table head={["Fecha", "Categoría", "Concepto", "Proveedor", "Base", "IVA", "Justificante"]}>
          {expenses.map((e) => (
            <tr key={e.id}>
              <td>{date(e.spent_on)}</td><td>{e.category}</td><td>{e.description}</td><td>{e.vendor ?? "—"}</td>
              <td className="tabular-nums">{eur(e.amount_cents)}</td><td className="tabular-nums">{eur(e.vat_cents)}</td>
              <td>{e.receipt_path ? <form action={openReceipt.bind(null, e.receipt_path)}><button className="text-xs text-gold">Ver</button></form> : <span className="text-xs text-danger">falta</span>}</td>
            </tr>
          ))}
        </Table>
        <form action={addExpense} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
          <Field label="Fecha"><input name="spent_on" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={input} /></Field>
          <Field label="Categoría"><select name="category" className={input}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <div className="sm:col-span-2"><Field label="Concepto"><input name="description" required className={input} /></Field></div>
          <Field label="Proveedor"><input name="vendor" className={input} /></Field>
          <Field label="Base (sin IVA) €"><input name="amount" required inputMode="decimal" className={input} /></Field>
          <Field label="IVA €"><input name="vat" inputMode="decimal" className={input} /></Field>
          <Field label="Justificante" hint="PDF o foto"><input name="receipt" type="file" accept="application/pdf,image/*" className={input} /></Field>
          <div><button className={btn}>Añadir gasto</button></div>
        </form>
      </Card>

      <Card title="Cumplimiento legal y de plataformas">
        <Table head={["Área", "Tarea", "Estado", "Fecha límite", "Notas", ""]}>
          {(compliance ?? []).map((c) => (
            <tr key={c.key}>
              <td className="text-xs text-muted">{c.area}</td>
              <td>{c.label}</td>
              <td colSpan={4}>
                <form action={updateCompliance.bind(null, c.key)} className="flex flex-wrap gap-1">
                  <select name="status" defaultValue={c.status} className={`${input} mt-0 w-32 py-1 ${c.status === "hecho" ? "text-ok" : c.status === "pendiente" ? "text-danger" : ""}`} aria-label={`Estado de ${c.label}`}>
                    {["pendiente", "en_curso", "hecho", "no_aplica"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                  <input name="due_on" type="date" defaultValue={c.due_on ?? ""} className={`${input} mt-0 w-36 py-1`} aria-label="Fecha límite" />
                  <input name="notes" defaultValue={c.notes} className={`${input} mt-0 flex-1 py-1`} aria-label="Notas" />
                  <button className={btnGhost}>OK</button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-muted">Recordatorio: modelo 303 en los 20 primeros días de abril, julio y octubre, y en enero (hasta el 30). Confírmalo con la gestoría.</p>
      </Card>
    </div>
  );
}
