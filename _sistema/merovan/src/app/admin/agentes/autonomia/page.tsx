import { Card, Notice, Toast, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { AGENTS } from "@/lib/agents/agents";
import { ACTION_TYPES, promotionAdvice } from "@/lib/agents/policy";
import { createClient } from "@/lib/supabase/server";
import { setLevel } from "../actions";

// Which action types each agent can propose (others are not relevant to it).
const RELEVANT: Record<string, string[]> = {
  orquestador: ["crear_borrador_producto"],
  proveedores: ["pedido_muestra", "pedido_proveedor", "mensaje_nuevo_contacto", "contrato"],
  precios: ["cambiar_precio"],
  fichas: ["crear_borrador_producto", "publicar_producto"],
  contenido: ["publicar_contenido"],
  publicacion: ["publicar_contenido"],
  anuncios: ["presupuesto_anuncios", "pausar_anuncio"],
  operaciones: ["pedido_proveedor", "responder_cliente", "reembolso"],
  investigador: [], analista: [], finanzas: [], cumplimiento: [],
};
const LEVELS = ["N0 · Observar", "N1 · Preparar", "N2 · Con aprobación", "N3 · Dentro de límites"];

export default async function Autonomy({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "producto", "marketing", "operaciones", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [{ data: policies }, { data: g }] = await Promise.all([
    supabase.from("autonomy_policies").select("*"),
    supabase.from("guardrails").select("value").eq("key", "promotion_min_approved").single(),
  ]);
  const minApproved = Number(g?.value ?? 10);
  const isOwner = staff.role === "owner";

  return (
    <>
      <Toast ok={ok} error={error} />
      <Notice>
        Todo arranca en <strong>N1</strong>. Solo el owner sube o baja niveles. Las acciones marcadas «siempre humano» no pasan de N2.
        Con la parada global o en modo simulación, ninguna acción externa ocurre de verdad aunque el nivel sea N3.
      </Notice>
      {AGENTS.filter((a) => (RELEVANT[a.key] ?? []).length).map((a) => (
        <Card key={a.key} title={a.name}>
          <ul className="divide-y divide-border">
            {RELEVANT[a.key].map((type) => {
              const t = ACTION_TYPES.find((x) => x.key === type)!;
              const p = policies?.find((x) => x.agent === a.key && x.action_type === type);
              const level = p?.level ?? 1;
              const advice = promotionAdvice({ level, approved: p?.approved_count ?? 0, rejected: p?.rejected_count ?? 0 }, minApproved);
              return (
                <li key={type} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-56 flex-1">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs text-muted">
                      Riesgo {t.risk}{t.alwaysHuman ? " · siempre humano" : ""} · {p?.approved_count ?? 0} aprobadas · {p?.rejected_count ?? 0} rechazadas
                    </p>
                    {advice && <p className="text-xs text-ok">{advice}</p>}
                  </div>
                  {isOwner ? (
                    <form action={setLevel.bind(null, a.key, type)} className="flex gap-2">
                      <select name="level" defaultValue={level} className={`${input} mt-0 w-52`} aria-label={`Nivel de ${a.name} para ${t.label}`}>
                        {LEVELS.map((l, i) => <option key={l} value={i} disabled={Boolean(t.alwaysHuman) && i > 2}>{l}</option>)}
                      </select>
                      <button className={btnGhost}>Guardar</button>
                    </form>
                  ) : <span className="text-sm">{LEVELS[level]}</span>}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </>
  );
}
