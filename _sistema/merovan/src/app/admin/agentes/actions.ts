"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireRole } from "@/lib/admin";
import { agentByKey } from "@/lib/agents/agents";
import { decide } from "@/lib/agents/pipeline";
import { ACTION_TYPES } from "@/lib/agents/policy";
import { runAgent } from "@/lib/agents/runtime";
import { modelFor, storeFor } from "@/lib/agents/server";
import { parseEuros } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function back(path: string, kind: "ok" | "error", msg: string): never {
  revalidatePath("/admin", "layout");
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

export async function toggleKillSwitch(formData: FormData) {
  const staff = await requireRole("owner", "operaciones");
  const on = formData.get("on") === "1";
  const reason = str(formData, "reason") || (on ? "Parada manual" : "Reanudación manual");
  const store = await storeFor(staff.id);
  await store.setKillSwitch(on, reason, false, staff.id);
  await audit(on ? "kill_switch_on" : "kill_switch_off", "system_state", null, { reason });
  back("/admin/agentes", "ok", on ? "Parada global activada: no se ejecuta nada externo" : "Sistema reanudado");
}

export async function toggleDryRun(formData: FormData) {
  const staff = await requireRole("owner");
  const dryRun = formData.get("dry_run") === "1";
  if (!dryRun && formData.get("confirm") !== "on") back("/admin/agentes", "error", "Marca la casilla para confirmar que quieres acciones reales");
  const supabase = await createClient();
  await supabase.from("system_state").update({ dry_run: dryRun, updated_by: staff.id, updated_at: new Date().toISOString() }).eq("id", true);
  await supabase.from("kill_switch_events").insert({ action: dryRun ? "simulacion_on" : "simulacion_off", reason: dryRun ? "Modo simulación activado" : "Modo simulación desactivado", actor: staff.id });
  await audit("modo_simulacion", "system_state", null, { dryRun });
  back("/admin/agentes", "ok", dryRun ? "Modo simulación activado" : "Modo simulación desactivado: las acciones aprobadas serán reales");
}

export async function runAgentNow(formData: FormData) {
  const staff = await requireRole("owner", "producto");
  const key = str(formData, "agent");
  const agent = agentByKey(key);
  if (!agent?.ready) back("/admin/agentes", "error", "Ese agente aún no está disponible");
  const store = await storeFor(staff.id);
  const r = await runAgent(store, modelFor(key), key, str(formData, "instructions") || "Haz tu ciclo habitual.");
  await audit("ejecutar_agente", "agent_runs", r.runId, { agent: key, status: r.status });
  back("/admin/agentes/actividad", r.status === "ok" ? "ok" : "error", `${agent!.name}: ${r.status}${r.budgetAlert ? " · aviso: 80 % del presupuesto de IA" : ""}`);
}

export async function decideProposals(formData: FormData) {
  const staff = await requireRole("owner", "producto");
  const approve = str(formData, "decision") === "aprobar";
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) back("/admin/agentes/bandeja", "error", "Selecciona al menos una propuesta");
  const note = str(formData, "note");
  if (!approve && note.length < 3) back("/admin/agentes/bandeja", "error", "Explica el motivo del rechazo");
  const store = await storeFor(staff.id);
  const results: string[] = [];
  for (const id of ids) {
    try {
      const r = await decide(store, id, approve, { role: staff.role });
      if (note) await store.updateProposal(id, { decision_note: note });
      results.push(r);
    } catch (e) {
      results.push(`error: ${(e as Error).message}`);
    }
  }
  await audit(approve ? "aprobar_propuestas" : "rechazar_propuestas", "agent_proposals", null, { ids, results });
  const errors = results.filter((r) => r.startsWith("error"));
  back("/admin/agentes/bandeja", errors.length ? "error" : "ok", errors.length ? errors.join(" · ") : `${results.length} propuesta(s): ${[...new Set(results)].join(", ")}`);
}

export async function setLevel(agent: string, actionType: string, formData: FormData) {
  const staff = await requireRole("owner");
  const level = Math.max(0, Math.min(3, Number(formData.get("level"))));
  const t = ACTION_TYPES.find((a) => a.key === actionType);
  if (!t || t.agentsForbidden) back("/admin/agentes/autonomia", "error", "Tipo de acción no válido");
  if (t.alwaysHuman && level > 2) back("/admin/agentes/autonomia", "error", `«${t.label}» siempre requiere aprobación humana (máx. N2)`);
  const supabase = await createClient();
  const { error } = await supabase.from("autonomy_policies")
    .upsert({ agent, action_type: actionType, level, updated_by: staff.id, updated_at: new Date().toISOString() }, { onConflict: "agent,action_type" });
  if (error) back("/admin/agentes/autonomia", "error", error.message);
  await audit("cambio_autonomia", "autonomy_policies", `${agent}:${actionType}`, { level });
  back("/admin/agentes/autonomia", "ok", `${agent} · ${t.label}: N${level}`);
}

export async function saveGuardrail(key: string, unit: string, formData: FormData) {
  const staff = await requireRole("owner");
  let value: number;
  try {
    value = unit === "centimos" ? parseEuros(formData.get("value")) ?? 0 : Number(String(formData.get("value")).replace(",", "."));
  } catch (e) {
    back("/admin/agentes/limites", "error", (e as Error).message);
  }
  if (!Number.isFinite(value) || value < 0) back("/admin/agentes/limites", "error", "Valor no válido");
  const supabase = await createClient();
  const { data: before } = await supabase.from("guardrails").select("value").eq("key", key).single();
  const { error } = await supabase.from("guardrails").update({ value, updated_by: staff.id, updated_at: new Date().toISOString() }).eq("key", key);
  if (error) back("/admin/agentes/limites", "error", error.message);
  await audit("cambio_limite", "guardrails", key, { before: before?.value, after: value });
  back("/admin/agentes/limites", "ok", "Límite guardado");
}

/** Development only: two sample proposals to try the inbox (one clean, one that compliance must veto). */
export async function createTestProposals() {
  if (process.env.NODE_ENV === "production") throw new Error("Solo en desarrollo");
  const staff = await requireRole("owner");
  const store = await storeFor(staff.id);
  const { propose } = await import("@/lib/agents/pipeline");
  const a = await propose(store, { agent: "anuncios", runId: null, taskId: null, actionType: "pausar_anuncio", title: "[PRUEBA] Pausar anuncio CRE-0002",
    payload: { anuncio: "CRE-0002 Unboxing", plataforma: "tiktok" }, reason: "CTR 0,50 % y ROAS 0,32 tras 17.000 impresiones (datos de ejemplo)", metrics: { ctr: 0.005, roas: 0.32 } });
  const b = await propose(store, { agent: "contenido", runId: null, taskId: null, actionType: "publicar_contenido", title: "[PRUEBA] Post con prueba social inventada",
    payload: { copy: "★★★★★ Miles de clientes satisfechos. ¡Últimas unidades!" }, reason: "Ejemplo que Cumplimiento debe vetar" });
  back("/admin/agentes/bandeja", "ok", `Propuestas de prueba: ${a.status} y ${b.status}`);
}

export async function updateConfigItem(key: string, formData: FormData) {
  await requireRole("owner");
  const supabase = await createClient();
  const { error } = await supabase.from("config_items")
    .update({ status: str(formData, "status"), notes: str(formData, "notes"), updated_at: new Date().toISOString() }).eq("key", key);
  back("/admin/configuracion", error ? "error" : "ok", error?.message ?? "Actualizado");
}

export async function acceptCandidate(id: string) {
  const staff = await requireRole("owner", "producto");
  const store = await storeFor(staff.id);
  const c = await store.getCandidate(id);
  if (!c || c.status !== "propuesto") back("/admin/agentes/investigacion", "error", "Candidato no disponible");
  if (c.demo) back("/admin/agentes/investigacion", "error", "Es un candidato de ejemplo: no se convierte en producto");
  const supabase = await createClient();
  const { data: niche } = await supabase.from("niches").select("name").eq("id", c.niche_id).single();
  const code = await store.createProductDraft({ name: c.name, description: c.description, price_cents: c.price_cents ?? undefined });
  const { data: product } = await supabase.from("products").update({ niche: niche?.name ?? null, score: Math.round(Number(c.score_total)) }).eq("code", code).select("id").single();
  await store.updateCandidate(id, { status: "aceptado", ...(product ? { product_id: product.id } : {}) });
  await audit("aceptar_candidato", "niche_candidates", id, { code });
  back("/admin/agentes/investigacion", "ok", `Creado ${code} como idea. Revisa proveedor y muestras en su ficha.`);
}

export async function discardCandidate(id: string) {
  const staff = await requireRole("owner", "producto");
  const store = await storeFor(staff.id);
  await store.updateCandidate(id, { status: "descartado" });
  await audit("descartar_candidato", "niche_candidates", id, {});
  back("/admin/agentes/investigacion", "ok", "Candidato descartado");
}

export async function deleteDemoResearch() {
  await requireRole("owner");
  const supabase = await createClient();
  const { error } = await supabase.from("niches").delete().eq("demo", true);
  if (error) back("/admin/agentes/investigacion", "error", error.message);
  await supabase.from("niche_candidates").delete().eq("demo", true);
  // Content test runs: their calendar entries, the proposals they created, creatives and scripts.
  const { data: cal } = await supabase.from("content_calendar").select("proposal_id").eq("ejemplo", true);
  const proposalIds = (cal ?? []).map((c) => c.proposal_id).filter(Boolean) as string[];
  await supabase.from("content_calendar").delete().eq("ejemplo", true);
  if (proposalIds.length) await supabase.from("agent_proposals").delete().in("id", proposalIds);
  await supabase.from("creatives").delete().eq("ejemplo", true);
  await supabase.from("scripts").delete().eq("ejemplo", true);
  await audit("borrar_datos_ejemplo", "niches", null, { proposals: proposalIds.length });
  back("/admin/agentes/investigacion", "ok", "Datos de ejemplo borrados");
}
