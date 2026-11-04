import { Badge, Card, Field, Notice, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { prohibitedTerms } from "@/lib/domain/listing";
import { ANGLES, SCRIPT_STATUSES, angleLabel } from "@/lib/marketing";
import { createClient } from "@/lib/supabase/server";
import { createScript, setScriptStatus } from "../actions";

export const metadata = { title: "Guiones" };

const PARTS = [
  { key: "hook", label: "Gancho (0-2 s)", hint: "lo que para el scroll" },
  { key: "problem", label: "Problema", hint: "" },
  { key: "demo", label: "Demostración", hint: "el producto funcionando" },
  { key: "proof", label: "Prueba", hint: "solo real y verificable" },
  { key: "offer", label: "Oferta", hint: "" },
  { key: "cta", label: "Llamada a la acción", hint: "" },
] as const;

export default async function ScriptsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole();
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [{ data: scripts }, { data: products }] = await Promise.all([
    supabase.from("scripts").select("*, products(code, name)").order("code", { ascending: false }),
    supabase.from("products").select("code, name").neq("status", "descartado").order("code"),
  ]);
  const canEdit = staff.role === "owner" || staff.role === "marketing";

  return (
    <>
      <Toast ok={ok} error={error} />
      <Notice>
        Reglas: nunca testimonios inventados ni promesas de salud o resultados no verificables. Si un guion contiene IA, márcalo:
        la plataforma puede exigir etiquetarlo.
      </Notice>
      <div className="grid gap-4 lg:grid-cols-2">
        {(scripts ?? []).map((s) => {
          const flags = prohibitedTerms(PARTS.map((p) => s[p.key]).join(" "));
          return (
            <Card key={s.id} title={`${s.code} · ${s.products?.name}`} actions={
              <span className="space-x-1"><Badge tone="gold">{angleLabel(s.angle)}</Badge>{s.contains_ai && <Badge>IA</Badge>}</span>
            }>
              <dl className="space-y-1 text-sm">
                {PARTS.map((p) => s[p.key] && (
                  <div key={p.key}><dt className="inline font-medium">{p.label}: </dt><dd className="inline">{s[p.key]}</dd></div>
                ))}
              </dl>
              {flags.length > 0 && <p className="mt-2 text-sm text-danger">⚠ Revisar: {flags.join(", ")}</p>}
              {canEdit && (
                <form action={setScriptStatus.bind(null, s.id)} className="mt-3 flex gap-1">
                  <select name="status" defaultValue={s.status} className={`${input} mt-0 w-36 py-1`} aria-label={`Estado de ${s.code}`}>
                    {SCRIPT_STATUSES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <button className={btnGhost}>OK</button>
                </form>
              )}
            </Card>
          );
        })}
      </div>

      {canEdit && (
        <Card title="Nuevo guion">
          <form action={createScript} className="grid gap-3 sm:grid-cols-2">
            <Field label="Producto">
              <select name="product" required defaultValue="" className={input}>
                <option value="" disabled>Elige…</option>
                {(products ?? []).map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
              </select>
            </Field>
            <Field label="Ángulo">
              <select name="angle" className={input}>{ANGLES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
            </Field>
            {PARTS.map((p) => (
              <Field key={p.key} label={p.label} hint={p.hint || undefined}>
                <textarea name={p.key} rows={2} required={p.key === "hook"} className={input} />
              </Field>
            ))}
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="contains_ai" /> Escrito con ayuda de IA</label>
            <div><button className={btn}>Crear guion</button></div>
          </form>
        </Card>
      )}
    </>
  );
}
