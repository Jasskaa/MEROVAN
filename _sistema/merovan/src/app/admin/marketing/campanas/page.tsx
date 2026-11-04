import Link from "next/link";
import { Card, Field, Notice, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { computeMetrics } from "@/lib/domain/metrics";
import { date, eur } from "@/lib/format";
import { CAMPAIGN_STATUSES, PLATFORMS, platformLabel } from "@/lib/marketing";
import { createClient } from "@/lib/supabase/server";
import { createCampaign, setCampaignStatus } from "../actions";

export const metadata = { title: "Campañas" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "marketing", "producto", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [{ data: campaigns }, { data: products }, { data: metrics }] = await Promise.all([
    supabase.from("campaigns").select("*, products(code, name)").order("code", { ascending: false }),
    supabase.from("products").select("code, name").neq("status", "descartado").order("code"),
    supabase.from("ad_metrics_daily").select("product_id, platform, day, impressions, clicks, spend_cents, add_to_cart, purchases, revenue_cents"),
  ]);
  const canEdit = staff.role === "owner" || staff.role === "marketing";

  return (
    <>
      <Toast ok={ok} error={error} />
      <Notice>
        MEROVAN no crea, activa ni cambia presupuestos en TikTok o Meta. Aquí se registra cada campaña con su tope de gasto para
        compararla con las métricas importadas. Nómbrala en la plataforma con el ID del producto (p. ej. <code>PRD-0001</code>).
      </Notice>
      <Card title="Campañas">
        <Table head={["ID", "Nombre", "Producto", "Plataforma", "Presupuesto/día", "Tope test", "Gastado", "Fechas", "Estado"]}>
          {(campaigns ?? []).map((c) => {
            const rows = (metrics ?? []).filter((m) => m.product_id === c.product_id && m.platform === c.platform
              && (!c.starts_on || m.day >= c.starts_on) && (!c.ends_on || m.day <= c.ends_on));
            const spent = computeMetrics(rows).spend_cents;
            const over = c.test_cap_cents != null && spent > c.test_cap_cents;
            return (
              <tr key={c.id}>
                <td className="font-mono text-xs">{c.code}</td>
                <td>{c.name}</td>
                <td>{c.products ? <Link href={`/admin/productos/${c.products.code}`} className="hover:text-gold">{c.products.code}</Link> : "—"}</td>
                <td>{platformLabel(c.platform)}</td>
                <td className="tabular-nums">{c.daily_budget_cents != null ? eur(c.daily_budget_cents) : "—"}</td>
                <td className="tabular-nums">{c.test_cap_cents != null ? eur(c.test_cap_cents) : "—"}</td>
                <td className={`tabular-nums ${over ? "font-semibold text-danger" : ""}`}>{eur(spent)}{over && " ⚠ supera el tope"}</td>
                <td className="text-xs">{date(c.starts_on)} – {date(c.ends_on)}</td>
                <td>
                  {canEdit ? (
                    <form action={setCampaignStatus.bind(null, c.id)} className="flex gap-1">
                      <select name="status" defaultValue={c.status} className={`${input} mt-0 w-28 py-1`} aria-label={`Estado de ${c.code}`}>
                        {CAMPAIGN_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                      <button className={btnGhost}>OK</button>
                    </form>
                  ) : c.status}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {canEdit && (
        <Card title="Registrar campaña">
          <form action={createCampaign} className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><Field label="Nombre"><input name="name" required placeholder="PRD-0001 Test TikTok noviembre" className={input} /></Field></div>
            <Field label="Producto">
              <select name="product" className={input}><option value="">—</option>
                {(products ?? []).map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
              </select>
            </Field>
            <Field label="Plataforma">
              <select name="platform" className={input}>{PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
            </Field>
            <Field label="Presupuesto diario (€)"><input name="daily_budget" inputMode="decimal" className={input} /></Field>
            <Field label="Tope de gasto del test (€)" hint="ver simulador"><input name="test_cap" inputMode="decimal" className={input} /></Field>
            <Field label="Inicio"><input name="starts_on" type="date" className={input} /></Field>
            <Field label="Fin"><input name="ends_on" type="date" className={input} /></Field>
            <div className="sm:col-span-4"><Field label="Notas"><input name="notes" className={input} /></Field></div>
            <div><button className={btn}>Registrar</button></div>
          </form>
        </Card>
      )}
    </>
  );
}
