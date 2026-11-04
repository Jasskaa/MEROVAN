import { Badge, Card, Field, Toast, btn, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { addCalendarItem, toggleCalendarItem } from "../actions";

export const metadata = { title: "Calendario de contenido" };

const fmtDay = (d: string) =>
  new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d));

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole();
  const { ok, error } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const supabase = await createClient();
  const [{ data: items }, { data: creatives }] = await Promise.all([
    supabase.from("content_calendar").select("*, creatives(code, hook)").gte("day", from).order("day").limit(200),
    supabase.from("creatives").select("id, code, hook").in("status", ["editado", "aprobado", "publicado"]).order("code", { ascending: false }),
  ]);
  const canEdit = staff.role === "owner" || staff.role === "marketing";
  const days = [...new Set((items ?? []).map((i) => i.day))];

  return (
    <>
      <Toast ok={ok} error={error} />
      <Card title="Próximas publicaciones">
        {days.length === 0 && <p className="text-sm text-muted">Nada planificado.</p>}
        <ol className="space-y-4">
          {days.map((d) => (
            <li key={d}>
              <h3 className={`mb-1 text-sm font-semibold capitalize ${d === today ? "text-gold" : d < today ? "text-muted" : ""}`}>
                {fmtDay(d)}{d === today && " · hoy"}
              </h3>
              <ul className="space-y-1">
                {(items ?? []).filter((i) => i.day === d).map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    {canEdit ? (
                      <form action={toggleCalendarItem.bind(null, i.id, i.done)}>
                        <button aria-label={i.done ? "Marcar como pendiente" : "Marcar como hecho"}
                          className={`h-4 w-4 rounded border ${i.done ? "border-ok bg-ok" : "border-border"}`} />
                      </form>
                    ) : <span>{i.done ? "✓" : "○"}</span>}
                    <span className={i.done ? "text-muted line-through" : ""}>{i.title}</span>
                    <Badge>{i.platform}</Badge><Badge tone={i.kind === "pago" ? "gold" : "neutral"}>{i.kind}</Badge>
                    {i.creatives && <span className="font-mono text-xs text-muted">{i.creatives.code}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Card>

      {canEdit && (
        <Card title="Planificar">
          <form action={addCalendarItem} className="grid gap-3 sm:grid-cols-5">
            <Field label="Día"><input name="day" type="date" required defaultValue={today} className={input} /></Field>
            <div className="sm:col-span-2"><Field label="Qué se publica"><input name="title" required className={input} /></Field></div>
            <Field label="Plataforma">
              <select name="platform" className={input}><option>tiktok</option><option>instagram</option><option>stories</option><option>youtube</option></select>
            </Field>
            <Field label="Tipo">
              <select name="kind" className={input}><option value="organico">orgánico</option><option value="pago">pago</option><option value="creador">creador</option></select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Creatividad">
                <select name="creative_id" className={input}><option value="">—</option>
                  {(creatives ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.hook.slice(0, 40)}</option>)}
                </select>
              </Field>
            </div>
            <div className="self-end"><button className={btn}>Añadir</button></div>
          </form>
        </Card>
      )}
    </>
  );
}
