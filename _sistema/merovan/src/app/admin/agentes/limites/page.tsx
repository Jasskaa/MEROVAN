import { Card, Notice, Toast, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { centsToInput, date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveGuardrail } from "../actions";

const fmt = (unit: string, v: number) => unit === "centimos" ? `${centsToInput(v)} €` : unit === "porcentaje" ? `${v} %` : String(v);

export default async function Limits({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "producto", "marketing", "operaciones", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const { data: rows } = await supabase.from("guardrails").select("*").order("key");
  const isOwner = staff.role === "owner";

  return (
    <>
      <Toast ok={ok} error={error} />
      <Notice>
        Límites duros: ningún agente puede cambiarlos ni saltárselos. Los límites de dinero empiezan en <strong>0 €</strong>, así que nada que cueste dinero
        puede ejecutarse hasta que los fijes. Cada cambio queda en el registro de auditoría.
      </Notice>
      <Card title="Límites duros">
        <ul className="divide-y divide-border">
          {(rows ?? []).map((g) => (
            <li key={g.key} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-64 flex-1">
                <p className="font-medium">{g.label}</p>
                <p className="text-xs text-muted">Actual: <strong>{fmt(g.unit, Number(g.value))}</strong> · cambiado {date(g.updated_at)}</p>
              </div>
              {isOwner && (
                <form action={saveGuardrail.bind(null, g.key, g.unit)} className="flex gap-2">
                  <input name="value" inputMode="decimal" defaultValue={g.unit === "centimos" ? centsToInput(Number(g.value)) : String(g.value)}
                    className={`${input} mt-0 w-32`} aria-label={g.label} />
                  <span className="self-center text-xs text-muted">{g.unit === "centimos" ? "€" : g.unit === "porcentaje" ? "%" : "ud."}</span>
                  <button className={btnGhost}>Guardar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
