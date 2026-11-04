import { Card, Field, Notice, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { DEFAULT_MAPPINGS, type Mapping, TARGET_FIELDS } from "@/lib/domain/csv-import";
import { date } from "@/lib/format";
import { PLATFORMS, platformLabel } from "@/lib/marketing";
import { createClient } from "@/lib/supabase/server";
import { importMetrics, importSample, saveMapping } from "../actions";

export const metadata = { title: "Importar métricas" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; plataforma?: string }> }) {
  const staff = await requireRole("owner", "marketing", "producto", "finanzas");
  const { ok, error, plataforma } = await searchParams;
  const platform = PLATFORMS.some((p) => p.key === plataforma) ? plataforma! : "tiktok";
  const supabase = await createClient();
  const [{ data: saved }, { data: history }] = await Promise.all([
    supabase.from("import_mappings").select("mapping").eq("platform", platform).maybeSingle(),
    supabase.from("metric_imports").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  const mapping: Mapping = (saved?.mapping as Mapping) ?? DEFAULT_MAPPINGS[platform];
  const canEdit = staff.role === "owner" || staff.role === "marketing";

  return (
    <>
      <Toast ok={ok} error={error} />
      <nav className="flex gap-1 text-sm">
        {PLATFORMS.map((p) => (
          <a key={p.key} href={`?plataforma=${p.key}`} className={`rounded-md border px-3 py-1 ${p.key === platform ? "border-gold text-gold" : "border-border"}`}>{p.label}</a>
        ))}
      </nav>

      {canEdit && (
        <Card title={`Subir informe de ${platformLabel(platform)}`}>
          <form action={importMetrics.bind(null, mapping)} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="platform" value={platform} />
            <Field label="Archivo CSV" hint="exportado por día y por anuncio">
              <input name="file" type="file" accept=".csv,text/csv" required className={input} />
            </Field>
            <button className={btn}>Importar</button>
          </form>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            <li>· Exporta el informe con desglose <strong>por día</strong> y <strong>por anuncio</strong>.</li>
            <li>· Volver a subir el mismo periodo <strong>actualiza</strong> las cifras, no las duplica.</li>
            <li>· Las filas se asignan a productos y creatividades por los IDs <code>PRD-xxxx</code> / <code>CRE-xxxx</code> en los nombres de campaña o anuncio.</li>
            <li>· Ejemplo de formato: <code>_sistema/merovan/docs/ejemplos/tiktok-ads-ejemplo.csv</code></li>
          </ul>
          {process.env.NODE_ENV !== "production" && platform === "tiktok" && (
            <form action={importSample} className="mt-3">
              <button className={btnGhost}>Cargar el CSV de ejemplo (solo desarrollo)</button>
            </form>
          )}
        </Card>
      )}

      <Card title="Mapeo de columnas">
        {!saved && <Notice>Mapeo por defecto (a verificar con una exportación real de {platformLabel(platform)}). Ajusta los nombres si tu informe es distinto.</Notice>}
        <form action={saveMapping.bind(null, platform)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <fieldset disabled={!canEdit} className="contents">
            {TARGET_FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                <input name={f.key} defaultValue={mapping[f.key] ?? ""} placeholder="nombre de la columna" className={input} />
              </Field>
            ))}
          </fieldset>
          {canEdit && <div className="self-end"><button className={btnGhost}>Guardar mapeo</button></div>}
        </form>
      </Card>

      <Card title="Historial de importaciones">
        <Table head={["Fecha", "Plataforma", "Archivo", "Periodo", "Filas", "Errores"]}>
          {(history ?? []).map((h) => (
            <tr key={h.id}>
              <td>{date(h.created_at)}</td>
              <td>{platformLabel(h.platform)}</td>
              <td className="max-w-48 truncate">{h.filename}</td>
              <td className="text-xs">{date(h.date_from)} – {date(h.date_to)}</td>
              <td className="tabular-nums">{h.rows_ok}</td>
              <td>
                {h.rows_error > 0 ? (
                  <details><summary className="cursor-pointer text-danger">{h.rows_error}</summary>
                    <ul className="mt-1 text-xs">{(h.errors as string[]).map((e) => <li key={e}>{e}</li>)}</ul>
                  </details>
                ) : "0"}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
