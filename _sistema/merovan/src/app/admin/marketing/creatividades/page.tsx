import Link from "next/link";
import { Badge, Card, Field, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { ANGLES, CREATIVE_STATUSES, PLATFORMS, angleLabel, human, platformLabel } from "@/lib/marketing";
import { createClient } from "@/lib/supabase/server";
import { createCreative, setCreativeStatus } from "../actions";

export const metadata = { title: "Creatividades" };

export default async function CreativesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; producto?: string }> }) {
  const staff = await requireRole();
  const { ok, error, producto } = await searchParams;
  const supabase = await createClient();
  const [{ data: creatives }, { data: products }, { data: scripts }, { data: creators }] = await Promise.all([
    supabase.from("creatives").select("*, products(code, name), creators(name), scripts(code)").order("code", { ascending: false }),
    supabase.from("products").select("code, name").neq("status", "descartado").order("code"),
    supabase.from("scripts").select("id, code, hook").order("code", { ascending: false }),
    supabase.from("creators").select("id, name").neq("status", "descartado").order("name"),
  ]);
  const canEdit = staff.role === "owner" || staff.role === "marketing";

  return (
    <>
      <Toast ok={ok} error={error} />
      <Card title={`Banco de creatividades (${creatives?.length ?? 0})`}>
        <Table head={["ID", "Producto", "Gancho", "Ángulo", "Plataformas", "Origen", "Etiquetas", "Estado"]}>
          {(creatives ?? []).map((c) => (
            <tr key={c.id}>
              <td className="font-mono text-xs">{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:text-gold">{c.code}</a> : c.code}</td>
              <td><Link href={`/admin/productos/${c.products?.code}`} className="hover:text-gold">{c.products?.name}</Link></td>
              <td className="max-w-64">{c.hook}{c.scripts && <span className="ml-1 font-mono text-xs text-muted">{c.scripts.code}</span>}</td>
              <td>{angleLabel(c.angle)}</td>
              <td className="text-xs">{(c.platforms ?? []).map(platformLabel).join(", ")}</td>
              <td>{c.creators?.name ?? "interno"}</td>
              <td className="space-x-1">{c.contains_ai && <Badge tone="gold">IA</Badge>}{c.sponsored && <Badge>patrocinado</Badge>}</td>
              <td>
                {canEdit ? (
                  <form action={setCreativeStatus.bind(null, c.id)} className="flex gap-1">
                    <select name="status" defaultValue={c.status} className={`${input} mt-0 w-32 py-1`} aria-label={`Estado de ${c.code}`}>
                      {CREATIVE_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <button className={btnGhost}>OK</button>
                  </form>
                ) : c.status}
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-muted">
          Convención: incluye el ID (p. ej. <code>CRE-0001</code>) en el nombre del anuncio en TikTok/Meta para que las métricas importadas se asignen solas.
        </p>
      </Card>

      {canEdit && (
        <Card title="Nueva creatividad">
          <form action={createCreative} className="grid gap-3 sm:grid-cols-3">
            <Field label="Producto">
              <select name="product" required defaultValue={producto ?? ""} className={input}>
                <option value="" disabled>Elige…</option>
                {(products ?? []).map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><Field label="Gancho (primeros 1-2 s)"><input name="hook" required className={input} /></Field></div>
            <Field label="Ángulo">
              <select name="angle" className={input}>{ANGLES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
            </Field>
            <Field label="Formato"><input name="format" defaultValue="video_vertical" className={input} /></Field>
            <Field label="Duración (s)"><input name="duration_s" type="number" min={1} className={input} /></Field>
            <Field label="Guion">
              <select name="script_id" className={input}><option value="">—</option>
                {(scripts ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.hook.slice(0, 40)}</option>)}
              </select>
            </Field>
            <Field label="Creador">
              <select name="creator_id" className={input}><option value="">Interno</option>
                {(creators ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Enlace al archivo" hint="Drive, Storage…"><input name="url" type="url" className={input} /></Field>
            <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-3">
              {PLATFORMS.map((p) => (
                <label key={p.key} className="flex items-center gap-1"><input type="checkbox" name="platforms" value={p.key} defaultChecked={p.key === "tiktok"} /> {p.label}</label>
              ))}
              <label className="flex items-center gap-1"><input type="checkbox" name="contains_ai" /> Contiene IA (se etiquetará)</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="sponsored" /> Colaboración / patrocinado</label>
            </fieldset>
            <div><button className={btn}>Crear creatividad</button></div>
          </form>
        </Card>
      )}
      <p className="text-xs text-muted">Estados: {CREATIVE_STATUSES.map(human).join(" → ")}</p>
    </>
  );
}
