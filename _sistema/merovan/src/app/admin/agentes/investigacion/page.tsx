import { Badge, Card, Notice, Table, Toast, btn, btnGhost } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import type { SupplierPlan } from "@/lib/agents/research";
import type { CandidateRow } from "@/lib/agents/store";
import { eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { acceptCandidate, deleteDemoResearch, discardCandidate } from "../actions";

type Niche = { id: string; name: string; thesis: string; audience: string; evidence: string[]; risks: string[]; confidence: string; demo: boolean; candidates: CandidateRow[] };

export default async function Research({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "producto", "marketing", "operaciones", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: limits }] = await Promise.all([
    supabase.from("niches").select("id, name, thesis, audience, evidence, risks, confidence, demo, candidates:niche_candidates(*)").neq("status", "descartado").order("created_at", { ascending: false }).limit(20),
    supabase.from("guardrails").select("key, value").in("key", ["min_margin_pct", "price_min_cents", "price_max_cents"]),
  ]);
  const niches = (data ?? []) as Niche[];
  const g = Object.fromEntries((limits ?? []).map((l) => [l.key, Number(l.value)]));
  const canAct = staff.role === "owner" || staff.role === "producto";
  const hasDemo = niches.some((n) => n.demo);

  return (
    <>
      <Toast ok={ok} error={error} />
      <Notice>
        Cadena: <b>Investigador</b> (nichos y candidatos puntuados) → <b>Proveedores</b> (principal y respaldo) → <b>Precios</b> (precio y margen). Ejecútalos en ese orden desde Resumen.
        Margen mínimo {g.min_margin_pct ?? 25} % · precio entre {eur(g.price_min_cents ?? 0)} y {eur(g.price_max_cents ?? 0)} (se cambian en Límites).
      </Notice>
      {hasDemo && staff.role === "owner" && (
        <form action={deleteDemoResearch}><button className={btnGhost}>Borrar datos de ejemplo</button></form>
      )}
      {niches.length === 0 && <Notice>Aún no hay investigación. Ejecuta el Investigador desde Resumen.</Notice>}
      {niches.map((n) => (
        <Card key={n.id} title={n.name} actions={
          <span className="flex gap-2">{n.demo && <Badge tone="gold">ejemplo</Badge>}<Badge>confianza {n.confidence}</Badge></span>
        }>
          <p className="text-sm">{n.thesis}</p>
          <p className="mt-1 text-xs text-muted">Público: {n.audience || "—"} · Señales: {n.evidence.join(" · ")}{n.risks.length ? ` · Riesgos: ${n.risks.join(" · ")}` : ""}</p>
          <div className="mt-4">
            <Table head={["Candidato", "Puntuación", "Proveedor", "Coste puesto", "Precio", "Margen", ""]}>
              {n.candidates.filter((c) => c.status !== "descartado").map((c) => {
                const plan = c.supplier_plan as SupplierPlan | null;
                return (
                  <tr key={c.id}>
                    <td><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{c.description}</div></td>
                    <td className="tabular-nums">
                      <Badge tone={c.passes ? "ok" : "danger"}>{Number(c.score_total)}/40</Badge>
                      {!c.passes && <div className="mt-1 text-xs text-muted">{c.score_reasons.join(" · ")}</div>}
                    </td>
                    <td className="text-xs">
                      {plan?.principal ? <>
                        <div>Principal: {plan.principal.supplier} ({plan.principal.warehouse_country}, {plan.principal.promised_days} d)</div>
                        <div>Respaldo: {plan.respaldo ? `${plan.respaldo.supplier} (${plan.respaldo.warehouse_country})` : "—"}</div>
                        {plan.warnings.length > 0 && <div className="text-danger">{plan.warnings.join(" · ")}</div>}
                      </> : <span className="text-muted">pendiente</span>}
                    </td>
                    <td className="tabular-nums">{c.landed_cents ? eur(c.landed_cents) : "—"}</td>
                    <td className="tabular-nums">{c.price_cents ? eur(c.price_cents) : c.price_reasons.length ? <span className="text-xs text-danger">{c.price_reasons.join(" · ")}</span> : "—"}</td>
                    <td className="tabular-nums">
                      {c.margin_pct != null && c.price_cents ? <>
                        {Number(c.margin_pct).toFixed(1).replace(".", ",")} %
                        <div className="mt-1">{c.real_data ? <Badge tone="ok">verificado</Badge> : <Badge tone="gold">estimado</Badge>}</div>
                      </> : "—"}
                    </td>
                    <td>
                      {canAct && c.status === "propuesto" ? (
                        <div className="flex flex-col gap-1">
                          {!c.demo && c.passes && c.price_cents && <form action={acceptCandidate.bind(null, c.id)}><button className={btn}>Crear producto</button></form>}
                          <form action={discardCandidate.bind(null, c.id)}><button className={btnGhost}>Descartar</button></form>
                        </div>
                      ) : <Badge>{c.status}</Badge>}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </Card>
      ))}
    </>
  );
}
