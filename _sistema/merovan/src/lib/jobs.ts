import "server-only";
import type { serviceClient } from "@/lib/admin";
import { AnthropicModel, hasApiKey } from "@/lib/agents/model";
import { autoKillCheck } from "@/lib/agents/pipeline";
import { runPendingTasks } from "@/lib/agents/queue";
import { runAgent } from "@/lib/agents/runtime";
import { SupabaseStore } from "@/lib/agents/supabase-store";
import { runDecisionEngine } from "@/lib/decisions";
import { exportToVault, vaultRoot } from "@/lib/obsidian/export";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>> | NonNullable<ReturnType<typeof serviceClient>>;

/** Runs a job, logs it in job_runs and retries once on failure. */
export async function runJob<T extends object>(supabase: Supabase, job: string, trigger: "manual" | "cron", fn: () => Promise<T>) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data: run } = await supabase.from("job_runs").insert({ job, trigger, attempt }).select("id").single();
    try {
      const details = await fn();
      await supabase.from("job_runs").update({ status: "ok", finished_at: new Date().toISOString(), details }).eq("id", run?.id);
      return { ok: true as const, details };
    } catch (e) {
      const error = (e as Error).message;
      await supabase.from("job_runs").update({ status: "error", finished_at: new Date().toISOString(), error }).eq("id", run?.id);
      if (attempt === 2) return { ok: false as const, error };
    }
  }
  return { ok: false as const, error: "sin intentos" };
}

/** Daily routine: decision engine, data retention and (on Mondays, where the vault is reachable) the weekly report. */
export async function dailyRoutine(supabase: Supabase, trigger: "manual" | "cron", retentionClient: Supabase | null) {
  const results: Record<string, unknown> = {};
  results.motor = await runJob(supabase, "motor_decision", trigger, async () => ({ productos: await runDecisionEngine(supabase) }));

  // Agents: automatic stop checks first, then the daily orchestrator cycle (only with a real model).
  const store = new SupabaseStore(supabase, null);
  results.parada = await runJob(supabase, "parada_automatica", trigger, async () => ({ parada: await autoKillCheck(store) }));
  if (hasApiKey()) {
    results.orquestador = await runJob(supabase, "orquestador_diario", trigger, async () => {
      const r = await runAgent(store, new AnthropicModel(), "orquestador", "Ciclo diario: revisa el estado, delega lo necesario y resume el día para Jaska.");
      return { estado: r.status, coste_microusd: r.costMicroUsd, resumen: r.summary.slice(0, 1000) };
    });
    results.tareas = await runJob(supabase, "tareas_agentes", trigger, async () => ({ tareas: await runPendingTasks(store, () => new AnthropicModel(), 8) }));
  }
  if (retentionClient) {
    results.retencion = await runJob(retentionClient, "retencion_datos", trigger, async () => {
      const { data, error } = await retentionClient.rpc("apply_retention");
      if (error) throw new Error(error.message);
      return data as object;
    });
  }
  const monday = new Date().getUTCDay() === 1;
  if ((monday || trigger === "manual") && vaultRoot()) {
    results.obsidian = await runJob(supabase, "exportar_obsidian", trigger, async () => {
      const r = await exportToVault(supabase);
      return { creadas: r.created.length, actualizadas: r.updated.length, movidas: r.moved.length, sin_cambios: r.unchanged, errores_boveda: r.vaultErrors };
    });
  }
  return results;
}
