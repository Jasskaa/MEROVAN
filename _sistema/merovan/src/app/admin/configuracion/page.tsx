import { Badge, Card, Toast, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { updateConfigItem } from "../agentes/actions";

export const metadata = { title: "Centro de configuración" };
const TONE = { pendiente: "danger", en_curso: "gold", hecho: "ok", bloqueado: "neutral" } as const;

export default async function ConfigCentre({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "producto", "marketing", "operaciones", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const { data: items } = await supabase.from("config_items").select("*").order("priority");
  const done = (items ?? []).filter((i) => i.status === "hecho").length;
  const external = (items ?? []).filter((i) => i.external_wait && i.status !== "hecho");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Centro de configuración</h1>
        <p className="text-sm text-muted">Lo que tienes que configurar tú, por orden. {done} de {items?.length ?? 0} hechos. Las claves nunca se escriben aquí ni en el chat: van a <code>.env.local</code>.</p>
      </header>
      <Toast ok={ok} error={error} />
      {external.length > 0 && (
        <div className="rounded-2xl border border-gold bg-gold-soft/40 p-4 text-sm">
          <p className="font-semibold">Lanza ya estas gestiones: dependen de terceros y tardan</p>
          <ul className="mt-1 list-disc pl-5">{external.map((i) => <li key={i.key}>{i.title} — {i.minutes}</li>)}</ul>
        </div>
      )}
      {(items ?? []).map((i) => (
        <Card key={i.key} title={`${i.priority}. ${i.title}`} actions={
          <span className="flex gap-2"><Badge>{i.area}</Badge>{i.external_wait && <Badge tone="gold">gestión externa</Badge>}<Badge tone={TONE[i.status as keyof typeof TONE]}>{i.status.replace("_", " ")}</Badge></span>
        }>
          <div className="grid gap-4 text-sm lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-muted">{i.why}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5">{i.steps.map((s: string) => <li key={s}>{s}</li>)}</ol>
            </div>
            <dl className="space-y-2 rounded-xl bg-background p-3 text-xs">
              <div><dt className="text-muted">Tiempo</dt><dd>{i.minutes}</dd></div>
              <div><dt className="text-muted">Dónde se introduce</dt><dd>{i.where_to}</dd></div>
              <div><dt className="text-muted">Cómo se prueba</dt><dd>{i.test}</dd></div>
              <div><dt className="text-muted">Lo necesita</dt><dd>{i.agents.length ? i.agents.join(", ") : "—"}</dd></div>
            </dl>
          </div>
          {staff.role === "owner" && (
            <form action={updateConfigItem.bind(null, i.key)} className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              <select name="status" defaultValue={i.status} className={`${input} mt-0 w-36`} aria-label="Estado">
                <option value="pendiente">pendiente</option><option value="en_curso">en curso</option><option value="hecho">hecho</option><option value="bloqueado">bloqueado</option>
              </select>
              <input name="notes" defaultValue={i.notes} placeholder="Notas (sin claves ni contraseñas)" className={`${input} mt-0 flex-1`} aria-label="Notas" />
              <button className={btnGhost}>Guardar</button>
            </form>
          )}
        </Card>
      ))}
    </div>
  );
}
