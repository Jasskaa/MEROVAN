/* eslint-disable @next/next/no-img-element -- media comes from Supabase Storage URLs */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Field, Notice, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { loadSettings, marginDefaults, requireRole } from "@/lib/admin";
import { computeMargin } from "@/lib/domain/margin";
import {
  LEGAL_CHECKS, STATUSES, type LegalChecks, type Scores, hasRedFlag, statusLabel, transitionBlockers,
} from "@/lib/domain/product";
import { centsToInput, date, eur, eurFloat } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  addOffer, addSample, addVariant, changeStatus, deleteMedia, deleteVariant, saveBasics, saveLegal, saveScorecard, updateSample,
} from "../actions";
import { MediaUploader } from "./media-uploader";
import { ScoreSliders } from "./score-sliders";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  return { title: (await params).code };
}

const LEGAL_OPTIONS = [
  { v: "pendiente", l: "Pendiente" },
  { v: "ok", l: "OK" },
  { v: "no_aplica", l: "No aplica" },
  { v: "rojo", l: "Bandera roja" },
];

export default async function ProductPage({
  params, searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireRole();
  const { code } = await params;
  const { ok, error } = await searchParams;
  const supabase = await createClient();

  const { data: p } = await supabase.from("products").select("*").eq("code", code).single();
  if (!p) notFound();

  const seesCosts = ["owner", "producto", "operaciones", "finanzas"].includes(staff.role);
  const canEdit = staff.role === "owner" || staff.role === "producto";
  const canMedia = canEdit || staff.role === "marketing";

  const [variants, media, offers, suppliers, samples, history, settings] = await Promise.all([
    supabase.from("product_variants").select("*").eq("product_id", p.id).order("created_at"),
    supabase.from("product_media").select("*").eq("product_id", p.id).order("position"),
    seesCosts ? supabase.from("supplier_offers").select("*, suppliers(code, name)").eq("product_id", p.id) : null,
    seesCosts ? supabase.from("suppliers").select("id, code, name").order("code") : null,
    seesCosts ? supabase.from("samples").select("*, suppliers(name)").eq("product_id", p.id).order("code") : null,
    supabase.from("status_history").select("*").eq("product_id", p.id).order("changed_at", { ascending: false }),
    loadSettings(),
  ]);

  const legal = (p.legal_checks ?? {}) as LegalChecks;
  const ctx = {
    scores: (p.score_detail ?? {}) as Scores,
    legal,
    hasApprovedSample: (samples?.data ?? []).some((s) => s.status === "aprobada"),
    sampleException: p.sample_exception,
    hasBackupSupplier: (offers?.data ?? []).some((o) => o.role === "respaldo"),
    gpsrComplete: Boolean(p.gpsr_manufacturer && p.gpsr_address && p.gpsr_contact),
    hasPrice: p.price_cents != null,
  };
  const defaults = marginDefaults(settings);
  const tiktokPct = Number(settings.tiktok_shop_commission ?? 0.09);
  const publicUrl = (path: string) =>
    supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/productos" className="text-xs text-muted hover:text-gold">← Productos</Link>
          <h1 className="font-serif text-3xl">{p.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono">{p.code}</span>
            <Badge tone="gold">{statusLabel(p.status)}</Badge>
            <Badge tone={p.publish_status === "publicado" ? "ok" : "neutral"}>tienda: {p.publish_status.replaceAll("_", " ")}</Badge>
            {hasRedFlag(legal) && <Badge tone="danger">bandera roja legal</Badge>}
          </p>
        </div>
        <Link href={`/admin/simulador?producto=${p.code}`} className={btnGhost}>Abrir en el simulador</Link>
      </header>

      <Toast ok={ok} error={error} />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ---------- Basics + GPSR ---------- */}
        <div id="datos">
          <Card title="Ficha">
            <form action={saveBasics.bind(null, code)} className="space-y-3">
              <fieldset disabled={!canEdit} className="space-y-3">
                <Field label="Nombre"><input name="name" defaultValue={p.name} required className={input} /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Precio (IVA incl.)"><input name="price" inputMode="decimal" placeholder="19,95" defaultValue={centsToInput(p.price_cents)} className={input} /></Field>
                  <Field label="Precio tachado"><input name="compare_at" inputMode="decimal" defaultValue={centsToInput(p.compare_at_cents)} className={input} /></Field>
                  <Field label="Nicho"><input name="niche" defaultValue={p.niche ?? ""} className={input} /></Field>
                </div>
                <Field label="Descripción"><textarea name="description" rows={4} defaultValue={p.description} className={input} /></Field>
                <Field label="Puntos clave" hint="uno por línea"><textarea name="bullets" rows={3} defaultValue={(p.bullets ?? []).join("\n")} className={input} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Peso (g)"><input name="weight_g" type="number" min={0} defaultValue={p.weight_g ?? ""} className={input} /></Field>
                  <Field label="País de origen"><input name="origin_country" defaultValue={p.origin_country ?? ""} className={input} /></Field>
                </div>
                <h3 className="pt-2 text-sm font-semibold">Datos GPSR <span className="font-normal text-muted">(obligatorios para vender en la UE)</span></h3>
                <Field label="Fabricante / responsable UE"><input name="gpsr_manufacturer" defaultValue={p.gpsr_manufacturer ?? ""} className={input} /></Field>
                <Field label="Dirección"><input name="gpsr_address" defaultValue={p.gpsr_address ?? ""} className={input} /></Field>
                <Field label="Contacto (email o web)"><input name="gpsr_contact" defaultValue={p.gpsr_contact ?? ""} className={input} /></Field>
                <Field label="Advertencias de seguridad"><textarea name="gpsr_warnings" rows={2} defaultValue={p.gpsr_warnings ?? ""} className={input} /></Field>
              </fieldset>
              {canEdit && <button className={btn}>Guardar ficha</button>}
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          {/* ---------- Media ---------- */}
          <div id="media">
            <Card title="Fotos y vídeos">
              {(media.data ?? []).length > 0 && (
                <ul className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {media.data!.map((m) => (
                    <li key={m.id} className="group relative aspect-square overflow-hidden rounded-md border border-border">
                      {m.kind === "video"
                        ? <video src={publicUrl(m.storage_path)} className="h-full w-full object-cover" muted />
                        : <img src={publicUrl(m.storage_path)} alt={m.alt || p.name} className="h-full w-full object-cover" />}
                      {canMedia && (
                        <form action={deleteMedia.bind(null, code, m.id)} className="absolute right-1 top-1">
                          <button className="rounded bg-black/70 px-1.5 text-xs text-white" aria-label="Eliminar archivo">✕</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canMedia ? <MediaUploader code={code} /> : <p className="text-sm text-muted">Sin permiso para subir archivos.</p>}
            </Card>
          </div>

          {/* ---------- Variants ---------- */}
          <div id="variantes">
            <Card title="Variantes y stock">
              <Table head={["SKU", "Variante", "Precio", "Stock", ""]}>
                {(variants.data ?? []).map((v) => (
                  <tr key={v.id}>
                    <td className="font-mono text-xs">{v.sku}</td>
                    <td>{v.title}</td>
                    <td className="tabular-nums">{v.price_cents != null ? eur(v.price_cents) : "precio base"}</td>
                    <td className="tabular-nums">{v.stock}</td>
                    <td>{canEdit && <form action={deleteVariant.bind(null, code, v.id)}><button className="text-xs text-danger">Eliminar</button></form>}</td>
                  </tr>
                ))}
              </Table>
              {canEdit && (
                <form action={addVariant.bind(null, code)} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <input name="sku" required placeholder="SKU" className={`${input} mt-0`} aria-label="SKU" />
                  <input name="title" placeholder="Ej. Negro / Pack 3" className={`${input} mt-0`} aria-label="Nombre de la variante" />
                  <input name="price" inputMode="decimal" placeholder="Precio (opc.)" className={`${input} mt-0`} aria-label="Precio de la variante" />
                  <input name="stock" type="number" min={0} placeholder="Stock" className={`${input} mt-0`} aria-label="Stock" />
                  <button className={btnGhost}>+ Añadir</button>
                </form>
              )}
            </Card>
          </div>
        </div>

        {/* ---------- Scorecard ---------- */}
        <div id="scorecard">
          <Card title="Puntuación (scorecard)">
            <form action={saveScorecard.bind(null, code)} className="space-y-3">
              <ScoreSliders initial={ctx.scores} disabled={!canEdit} />
              {canEdit && <button className={btn}>Guardar puntuación</button>}
            </form>
          </Card>
        </div>

        {/* ---------- Legal ---------- */}
        <div id="legal">
          <Card title="Checklist legal">
            <form action={saveLegal.bind(null, code)} className="space-y-2">
              <fieldset disabled={!canEdit} className="space-y-2">
                {LEGAL_CHECKS.map((c) => (
                  <label key={c.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className={legal[c.key] === "rojo" ? "text-danger" : ""}>{c.label}</span>
                    <select name={c.key} defaultValue={legal[c.key] ?? "pendiente"} className={`${input} mt-0 w-36`}>
                      {LEGAL_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </label>
                ))}
              </fieldset>
              {canEdit && <button className={btn}>Guardar checklist</button>}
            </form>
          </Card>
        </div>

        {/* ---------- Suppliers & margin ---------- */}
        {seesCosts && (
          <div id="proveedores" className="xl:col-span-2">
            <Card title="Proveedores y margen" actions={<Link href="/admin/proveedores" className="text-xs text-muted hover:text-gold">Gestionar proveedores →</Link>}>
              {p.price_cents == null && <Notice>Pon un precio en la ficha para calcular el margen.</Notice>}
              <Table head={["Proveedor", "Papel", "Coste", "Envío", "Plazo", "Margen web", "ROAS eq. web", "Margen TikTok", "ROAS eq. TikTok"]}>
                {(offers?.data ?? []).map((o) => {
                  const base = p.price_cents != null
                    ? { ...defaults, priceWithVat: p.price_cents / 100, vatRate: Number(p.vat_rate), productCost: o.unit_cost_cents / 100, shippingCost: o.shipping_cents / 100 }
                    : null;
                  const web = base && computeMargin(base);
                  const tt = base && computeMargin({ ...base, platformCommissionPct: tiktokPct });
                  return (
                    <tr key={o.id}>
                      <td>{o.suppliers?.name} <span className="font-mono text-xs text-muted">{o.suppliers?.code}</span></td>
                      <td><Badge tone={o.role === "principal" ? "gold" : "neutral"}>{o.role}</Badge></td>
                      <td className="tabular-nums">{eur(o.unit_cost_cents)}</td>
                      <td className="tabular-nums">{eur(o.shipping_cents)}</td>
                      <td>{o.promised_days ? `${o.promised_days} d` : "—"}</td>
                      <td className={`tabular-nums ${web && web.contributionMargin <= 0 ? "text-danger" : ""}`}>{web ? eurFloat(web.contributionMargin) : "—"}</td>
                      <td className="tabular-nums">{web?.breakEvenRoas ?? "—"}</td>
                      <td className="tabular-nums">{tt ? eurFloat(tt.contributionMargin) : "—"}</td>
                      <td className="tabular-nums">{tt?.breakEvenRoas ?? "—"}</td>
                    </tr>
                  );
                })}
              </Table>
              {!ctx.hasBackupSupplier && <p className="mt-2 text-xs text-muted">Falta proveedor de respaldo (obligatorio para escalar).</p>}
              {canEdit && (suppliers?.data ?? []).length > 0 && (
                <form action={addOffer.bind(null, code)} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <select name="supplier_id" required className={`${input} mt-0 col-span-2`} aria-label="Proveedor">
                    {suppliers!.data!.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                  </select>
                  <select name="role" className={`${input} mt-0`} aria-label="Papel">
                    <option value="principal">principal</option><option value="respaldo">respaldo</option><option value="candidato">candidato</option>
                  </select>
                  <input name="unit_cost" required inputMode="decimal" placeholder="Coste €" className={`${input} mt-0`} aria-label="Coste unitario" />
                  <input name="shipping" inputMode="decimal" placeholder="Envío €" className={`${input} mt-0`} aria-label="Envío" />
                  <input name="promised_days" type="number" min={0} placeholder="Días" className={`${input} mt-0`} aria-label="Plazo prometido en días" />
                  <button className={`${btnGhost} col-span-2 sm:col-span-6 sm:justify-self-start`}>Guardar oferta</button>
                </form>
              )}
              <p className="mt-3 text-xs text-muted">
                Cálculo sin IVA · pasarela {(defaults.paymentFeePct * 100).toFixed(1)} % + {eurFloat(defaults.paymentFeeFixed)} · devoluciones {(defaults.returnsProvisionPct * 100).toFixed(0)} % · TikTok Shop {(tiktokPct * 100).toFixed(0)} % (a verificar). Se editan en Ajustes.
              </p>
            </Card>
          </div>
        )}

        {/* ---------- Samples ---------- */}
        {seesCosts && (
          <div id="muestras" className="xl:col-span-2">
            <Card title="Muestras">
              <div className="space-y-3">
                {(samples?.data ?? []).map((s) => (
                  <form key={s.id} action={updateSample.bind(null, code, s.id)} className="grid grid-cols-2 items-end gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-7">
                    <div className="col-span-2 sm:col-span-1">
                      <p className="font-mono text-xs">{s.code}</p>
                      <p>{s.suppliers?.name}</p>
                      <p className="text-xs text-muted">pedida {date(s.ordered_at)}</p>
                    </div>
                    <Field label="Estado">
                      <select name="status" defaultValue={s.status} disabled={!canEdit} className={input}>
                        {["pedida", "recibida", "aprobada", "rechazada"].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </Field>
                    <Field label="Recibida"><input name="received_at" type="date" defaultValue={s.received_at ?? ""} disabled={!canEdit} className={input} /></Field>
                    <Field label="Calidad 1-5"><input name="quality" type="number" min={1} max={5} defaultValue={s.quality ?? ""} disabled={!canEdit} className={input} /></Field>
                    <Field label="¿Como las fotos?">
                      <select name="matches_photos" defaultValue={s.matches_photos == null ? "" : s.matches_photos ? "si" : "no"} disabled={!canEdit} className={input}>
                        <option value="">—</option><option value="si">Sí</option><option value="no">No</option>
                      </select>
                    </Field>
                    <Field label="Notas"><input name="notes" defaultValue={s.notes} disabled={!canEdit} className={input} /></Field>
                    {canEdit && <button className={btnGhost}>Guardar</button>}
                  </form>
                ))}
              </div>
              {canEdit && (suppliers?.data ?? []).length > 0 && (
                <form action={addSample.bind(null, code)} className="mt-4 flex flex-wrap items-end gap-2">
                  <Field label="Pedir muestra a">
                    <select name="supplier_id" required className={input}>
                      {suppliers!.data!.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Fecha de pedido"><input name="ordered_at" type="date" className={input} /></Field>
                  <button className={btnGhost}>+ Registrar muestra</button>
                </form>
              )}
            </Card>
          </div>
        )}

        {/* ---------- Status ---------- */}
        <div id="estado" className="xl:col-span-2">
          <Card title="Estado en el embudo">
            <ul className="mb-4 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-5">
              {STATUSES.map((s) => {
                const blockers = transitionBlockers(s.key, ctx);
                const current = s.key === p.status;
                return (
                  <li key={s.key} title={blockers.join("\n")}
                    className={`rounded-md border px-2 py-1 ${current ? "border-gold text-gold" : blockers.length ? "border-border text-muted line-through decoration-danger/60" : "border-ok/50"}`}>
                    {current ? "● " : ""}{s.label}
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <form action={changeStatus.bind(null, code)} className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
                <Field label="Pasar a">
                  <select name="to" className={input} defaultValue="">
                    <option value="" disabled>Elige…</option>
                    {STATUSES.filter((s) => s.key !== p.status).map((s) => {
                      const blocked = transitionBlockers(s.key, ctx).length > 0;
                      return <option key={s.key} value={s.key}>{s.label}{blocked ? " (bloqueado)" : ""}</option>;
                    })}
                  </select>
                </Field>
                <Field label="Motivo"><input name="reason" required minLength={3} placeholder="Por qué cambia de estado" className={input} /></Field>
                <button className={btn}>Cambiar estado</button>
                {!ctx.hasApprovedSample && (
                  <div className="sm:col-span-3">
                    <Field label="Excepción de muestra" hint="solo si se publica sin muestra aprobada; queda registrada">
                      <input name="sample_exception" defaultValue={p.sample_exception ?? ""} className={input} />
                    </Field>
                  </div>
                )}
              </form>
            )}
            <p className="mt-2 text-xs text-muted">Pasa el ratón por un estado tachado para ver qué falta.</p>

            {(history.data ?? []).length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">Historial</h3>
                <Table head={["Fecha", "De", "A", "Motivo"]}>
                  {history.data!.map((h) => (
                    <tr key={h.id}>
                      <td>{date(h.changed_at)}</td>
                      <td>{h.from_status ? statusLabel(h.from_status) : "—"}</td>
                      <td>{statusLabel(h.to_status)}</td>
                      <td>{h.reason}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
