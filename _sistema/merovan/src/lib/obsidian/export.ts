import "server-only";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { loadSettings, marginDefaults, type serviceClient } from "@/lib/admin";
import { computeMargin } from "@/lib/domain/margin";
import { computeMetrics } from "@/lib/domain/metrics";
import { statusLabel } from "@/lib/domain/product";
import { realProfit } from "@/lib/domain/profit";
import { loadFinance } from "@/lib/finance";
import type { createClient } from "@/lib/supabase/server";
import { checkVault } from "./check";
import { isoWeek, mdTable, mergeAutoZone, parseNote, updateNote } from "./markdown";

type Supabase = Awaited<ReturnType<typeof createClient>> | NonNullable<ReturnType<typeof serviceClient>>;

// Product status → funnel folder (see Guía de la bóveda).
const FOLDER: Record<string, string> = {
  idea: "01-Ideas-y-candidatos", candidato: "01-Ideas-y-candidatos",
  validando_proveedor: "02-En-validacion", muestra_pedida: "02-En-validacion", muestra_aprobada: "02-En-validacion",
  listo_para_publicar: "02-En-validacion", en_test: "03-En-test", pausado: "03-En-test",
  escalando: "04-Escalando", descartado: "05-Descartados",
};

const eur = (c: number | null | undefined) => (c == null ? "—" : `${(c / 100).toFixed(2).replace(".", ",")} €`);
const num = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2).replace(".", ","));
const safeName = (s: string) => s.replace(/[?:\\/|*"<>]/g, "-").trim();

export function vaultRoot() {
  const root = resolve(process.env.VAULT_PATH ?? join(process.cwd(), "..", ".."));
  return existsSync(join(root, ".obsidian")) ? root : null;
}

export interface ExportResult {
  created: string[];
  updated: string[];
  moved: string[];
  unchanged: number;
  vaultErrors: number;
}

function inside(root: string, path: string) {
  const rel = relative(root, path);
  return !rel.startsWith("..") && !rel.includes(`_sistema${sep}`);
}

/** Writes a note only when its text changes. Returns what happened. */
function write(root: string, rel: string, text: string, existing: string | null, r: ExportResult) {
  const full = join(root, rel);
  if (!inside(root, full)) throw new Error(`Ruta fuera de la bóveda: ${rel}`);
  if (existing === text) { r.unchanged++; return; }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, "utf8");
  (existing === null ? r.created : r.updated).push(rel);
}

/** Map id → relative path for notes under a folder (by frontmatter id). */
function notesById(root: string, folder: string) {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".md")) {
        const id = parseNote(readFileSync(full, "utf8")).front.id;
        if (typeof id === "string") out.set(id, relative(root, full).split(sep).join("/"));
      }
    }
  };
  walk(join(root, folder));
  return out;
}

const read = (root: string, rel: string) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);

/** Updates only the automatic zone of an existing index note (never its frontmatter or text). */
function updateIndexZone(root: string, rel: string, auto: string, r: ExportResult) {
  const existing = read(root, rel);
  if (existing === null) return;
  const { body } = parseNote(existing);
  const head = existing.slice(0, existing.length - body.length);
  write(root, rel, head + mergeAutoZone(body, auto, "## Generado por la app"), existing, r);
}

export async function exportToVault(supabase: Supabase, today = new Date().toISOString().slice(0, 10)): Promise<ExportResult> {
  const root = vaultRoot();
  if (!root) throw new Error("No se encuentra la bóveda (VAULT_PATH). El exportador solo funciona donde están los archivos de Obsidian.");
  const r: ExportResult = { created: [], updated: [], moved: [], unchanged: 0, vaultErrors: 0 };
  const settings = await loadSettings(supabase);
  const defaults = marginDefaults(settings);
  const vatOpts = { revenueIncludesVat: settings.ad_revenue_includes_vat !== false, vatRate: Number(settings.vat_default ?? 0.21) };

  const [{ data: products }, { data: recs }, { data: history }, { data: metrics }] = await Promise.all([
    supabase.from("products").select("id, code, name, niche, status, publish_status, price_cents, vat_rate, score, " +
      "supplier_offers(role, unit_cost_cents, shipping_cents, suppliers(code)), creatives(code, hook)").order("code"),
    supabase.from("recommendations").select("product_id, decision, confidence, reasons, status, created_at, decision_note")
      .neq("status", "sustituida").order("created_at", { ascending: false }),
    supabase.from("status_history").select("product_id, from_status, to_status, reason, changed_at").order("changed_at", { ascending: false }),
    supabase.from("ad_metrics_daily").select("product_id, impressions, clicks, spend_cents, add_to_cart, purchases, revenue_cents"),
  ]);

  // ---------- Product notes ----------
  type P = { id: string; code: string; name: string; niche: string | null; status: string; publish_status: string; price_cents: number | null;
    vat_rate: number; score: number | null; supplier_offers: { role: string; unit_cost_cents: number; shipping_cents: number; suppliers: { code: string } | null }[];
    creatives: { code: string; hook: string }[] };
  const existingNotes = notesById(root, "02-PRODUCTOS");
  for (const p of (products ?? []) as unknown as P[]) {
    const offer = p.supplier_offers?.find((o) => o.role === "principal");
    const margin = p.price_cents && offer
      ? computeMargin({ ...defaults, priceWithVat: p.price_cents / 100, vatRate: Number(p.vat_rate),
          productCost: offer.unit_cost_cents / 100, shippingCost: offer.shipping_cents / 100 })
      : null;
    const rec = recs?.find((x) => x.product_id === p.id);
    const ads = computeMetrics((metrics ?? []).filter((m) => m.product_id === p.id), vatOpts);
    const state = p.status.replaceAll("_", "-");

    const managed = {
      tipo: "producto", id: p.code, estado: state, nicho: p.niche ?? "", canal: ["web", "tiktok-shop"],
      puntuacion: p.score, margen_contribucion: margin ? Math.round(margin.contributionMargin * 100) / 100 : null,
      roas_equilibrio: margin?.breakEvenRoas ?? null, proveedor_principal: offer?.suppliers?.code ?? "",
      decision: rec?.decision ?? "esperar", motivo_decision: rec?.reasons?.[0] ?? "",
      tags: [`producto/estado/${state}`, `decision/${rec?.decision ?? "esperar"}`],
    };
    const auto = [
      `_Actualizado desde la app. No escribas dentro de esta zona: se regenera en cada exportación._`, "",
      mdTable(["Dato", "Valor"], [
        ["Estado", statusLabel(p.status)], ["Tienda", p.publish_status.replaceAll("_", " ")], ["Precio", eur(p.price_cents)],
        ["Margen de contribución", margin ? eur(Math.round(margin.contributionMargin * 100)) : "—"],
        ["ROAS de equilibrio / objetivo", `${num(margin?.breakEvenRoas)} / ${num(margin?.targetRoas)}`],
        ["Gasto en anuncios (total)", eur(ads.spend_cents)], ["ROAS anuncios", num(ads.roas)], ["Compras atribuidas", ads.purchases],
        ["Recomendación", rec ? `${rec.decision.toUpperCase()} (${rec.status}, confianza ${rec.confidence})` : "—"],
      ]),
      "", "### Historial de estados",
      mdTable(["Fecha", "De", "A", "Motivo"], (history ?? []).filter((h) => h.product_id === p.id).slice(0, 10)
        .map((h) => [h.changed_at.slice(0, 10), h.from_status ? statusLabel(h.from_status) : "—", statusLabel(h.to_status), h.reason])),
      "", `Creatividades: ${(p.creatives ?? []).map((c) => c.code).join(", ") || "—"} · Ficha en la app: /admin/productos/${p.code}`,
    ].join("\n");

    const wantFolder = `02-PRODUCTOS/${FOLDER[p.status] ?? "01-Ideas-y-candidatos"}`;
    let rel = existingNotes.get(p.code) ?? `${wantFolder}/${safeName(`${p.code} ${p.name}`)}.md`;
    if (!rel.startsWith(`${wantFolder}/`) && existingNotes.has(p.code)) {
      // Funnel moved: move the note, keeping its file name so [[links]] keep working.
      const target = `${wantFolder}/${rel.split("/").pop()}`;
      mkdirSync(join(root, wantFolder), { recursive: true });
      renameSync(join(root, rel), join(root, target));
      r.moved.push(`${rel} → ${target}`);
      rel = target;
    }
    const existing = read(root, rel);
    const body = `\n# ${p.code} ${p.name}\n\nEn una frase: \n\n## Por qué este producto\n\n## Aprendizajes\n`;
    const { text } = updateNote(existing, managed, auto, today, body);
    write(root, rel, text, existing, r);
  }

  // ---------- Weekly report ----------
  const { year, week } = isoWeek(today);
  const repId = `REP-${year}-S${String(week).padStart(2, "0")}`;
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() || 7) - 1));
  const from = monday.toISOString().slice(0, 10);
  const sunday = new Date(monday.getTime() + 6 * 864e5).toISOString().slice(0, 10);
  const fin = await loadFinance(supabase as Awaited<ReturnType<typeof createClient>>, from, sunday);
  const byProduct = realProfit(fin.profitOrders, fin.adSpend, "product");
  const [{ data: weekAds }, { data: openTickets }, { count: pendingApprovals }, { data: topCreatives }] = await Promise.all([
    supabase.from("ad_metrics_daily").select("spend_cents, revenue_cents, purchases, impressions, clicks, add_to_cart").gte("day", from).lte("day", sunday),
    supabase.from("tickets").select("number, subject").neq("status", "resuelto"),
    supabase.from("approvals").select("*", { count: "exact", head: true }).eq("status", "pendiente"),
    supabase.from("ad_metrics_daily").select("creative_id, spend_cents, revenue_cents, purchases, impressions, clicks, add_to_cart, creatives(code, hook)")
      .gte("day", from).lte("day", sunday).not("creative_id", "is", null),
  ]);
  const wk = computeMetrics(weekAds ?? [], vatOpts);
  const name = (id: string) => (products as unknown as P[] | null)?.find((x) => x.id === id);
  const creativeRows = new Map<string, { code: string; hook: string; rows: typeof topCreatives }>();
  for (const c of topCreatives ?? []) {
    const cr = c.creatives as unknown as { code: string; hook: string };
    const e = creativeRows.get(c.creative_id!) ?? { code: cr.code, hook: cr.hook, rows: [] };
    e.rows!.push(c);
    creativeRows.set(c.creative_id!, e);
  }
  const reportAuto = [
    `_Generado por la app el ${today}. Periodo ${from} – ${sunday}._`, "",
    "### Resumen",
    mdTable(["Indicador", "Valor"], [
      ["Pedidos", fin.profitOrders.filter((o) => o.status !== "pendiente_pago" && o.status !== "cancelado").length],
      ["Ventas netas (sin IVA)", eur(byProduct.reduce((s, l) => s + l.netSalesCents, 0))],
      ["Gasto en anuncios", eur(wk.spend_cents)], ["ROAS anuncios", num(wk.roas)],
      ["Beneficio de contribución", eur(byProduct.reduce((s, l) => s + l.profitCents, 0))],
      ["Gastos generales", eur(fin.expenses.reduce((s, e) => s + e.amount_cents, 0))],
      ["Incidencias abiertas", openTickets?.length ?? 0], ["Aprobaciones pendientes", pendingApprovals ?? 0],
    ]),
    "", "### Escalar / arreglar / matar",
    mdTable(["Producto", "Recomendación", "Estado", "Motivo"], (recs ?? []).filter((x) => x.status === "pendiente" || x.status === "aceptada")
      .map((x) => { const p = name(x.product_id); return [p ? `[[${existingNotes.get(p.code)?.split("/").pop()?.replace(/\.md$/, "") ?? p.code}|${p.code}]]` : "—", x.decision.toUpperCase(), x.status, x.reasons?.[0] ?? ""]; })),
    "", "### Mejores creatividades de la semana",
    mdTable(["Creatividad", "Gancho", "Gasto", "ROAS"], [...creativeRows.values()]
      .map((c) => ({ c, m: computeMetrics(c.rows ?? [], vatOpts) })).sort((a, b) => (b.m.roas ?? 0) - (a.m.roas ?? 0)).slice(0, 5)
      .map(({ c, m }) => [c.code, c.hook, eur(m.spend_cents), num(m.roas)])),
    "", "### Beneficio real por producto",
    mdTable(["Producto", "Pedidos", "Ventas netas", "Beneficio"], byProduct.map((l) => [name(l.key)?.code ?? fin.products.get(l.key)?.code ?? l.key, l.orders, eur(l.netSalesCents), eur(l.profitCents)])),
  ].join("\n");
  const repRel = notesById(root, "08-REPORTES").get(repId) ?? `08-REPORTES/Semanales/${repId}.md`;
  const repExisting = read(root, repRel);
  const repBody = `\n# ${repId}\n\nEn una frase: informe semanal de MEROVAN generado por la app; comenta debajo.\n\n## Comentarios del equipo\n\n## Decisiones de la semana\n\n## Próximos pasos\n`;
  const rep = updateNote(repExisting, { tipo: "informe", id: repId, estado: "abierto", responsable: "owner", tags: [], periodo: `${from}/${sunday}` }, reportAuto, today, repBody);
  write(root, repRel, rep.text, repExisting, r);

  // ---------- Decision history ----------
  const histRel = "01-ESTRATEGIA/Historial de decisiones.md";
  const histExisting = read(root, histRel);
  const histAuto = mdTable(["Fecha", "Producto", "Recomendación", "Resultado", "Motivo humano"],
    (recs ?? []).filter((x) => ["aceptada", "rechazada", "ejecutada"].includes(x.status))
      .map((x) => [x.created_at.slice(0, 10), name(x.product_id)?.code ?? "—", x.decision.toUpperCase(), x.status, x.decision_note ?? ""]));
  const hist = updateNote(histExisting, { tipo: "indice", id: "INI-DECISIONES", estado: "activo", responsable: "owner", tags: ["inicio"] }, histAuto, today,
    "\n# Historial de decisiones\n\nEn una frase: qué recomendó el motor y qué decidimos, para aprender qué productos y ángulos funcionan.\n\n## Aprendizajes\n");
  write(root, histRel, hist.text, histExisting, r);

  // ---------- Configuration centre mirror ----------
  const { data: config } = await supabase.from("config_items").select("*").order("priority");
  if (config?.length) {
    const cfgRel = "00-INICIO/Configuración pendiente.md";
    const cfgExisting = read(root, cfgRel);
    const icon: Record<string, string> = { pendiente: "☐", en_curso: "◐", hecho: "☑", bloqueado: "⛔" };
    const cfgAuto = [
      `_Espejo del Centro de configuración del panel (${config.filter((c) => c.status === "hecho").length}/${config.length} hechos). Las claves nunca se escriben aquí._`, "",
      ...config.flatMap((c) => [
        `### ${icon[c.status] ?? "☐"} ${c.priority}. ${c.title}${c.external_wait ? " · gestión externa" : ""}`,
        `${c.why}`, "",
        ...c.steps.map((s: string, i: number) => `${i + 1}. ${s}`), "",
        `- **Tiempo:** ${c.minutes} · **Dónde:** ${c.where_to} · **Prueba:** ${c.test}`, "",
      ]),
    ].join("\n");
    const cfg = updateNote(cfgExisting, { tipo: "guia", id: "INI-CONFIG", estado: "activo", responsable: "owner", tags: ["inicio"] }, cfgAuto, today,
      "\n# Configuración pendiente\n\nEn una frase: lo que Jaska tiene que configurar para que los agentes trabajen, por orden de prioridad.\n");
    write(root, cfgRel, cfg.text, cfgExisting, r);
  }

  // ---------- Index zones (so new notes are never orphans) ----------
  const productNotes = notesById(root, "02-PRODUCTOS");
  updateIndexZone(root, "02-PRODUCTOS/_Índice.md",
    mdTable(["Producto", "Estado"], (products as unknown as P[] ?? []).map((p) => {
      const file = productNotes.get(p.code)?.split("/").pop()?.replace(/\.md$/, "");
      return [file ? `[[${file}]]` : p.code, statusLabel(p.status)];
    })), r);
  const reports = [...notesById(root, "08-REPORTES").entries()].sort(([a], [b]) => b.localeCompare(a));
  updateIndexZone(root, "08-REPORTES/_Índice.md", reports.map(([id, rel]) => `- [[${rel.split("/").pop()!.replace(/\.md$/, "")}|${id}]]`).join("\n"), r);

  r.vaultErrors = checkVault(root).errors.length;
  return r;
}
