// Task queue worker: runs the tasks the orchestrator (or a person) assigned to agents.
// A task is claimed with a lease so two workers never run it twice; failures retry up to max_attempts.
import { agentByKey } from "./agents";
import type { ModelClient } from "./model";
import { runAgent } from "./runtime";
import type { AgentStore } from "./store";

export async function runPendingTasks(store: AgentStore, modelFor: (agent: string) => ModelClient, limit = 5) {
  const done: { task: string; agent: string; status: string }[] = [];
  for (let n = 0; n < limit; n++) {
    if ((await store.getState()).killSwitch) break; // agents may analyse during a stop, but the queue waits
    const task = await store.claimTask();
    if (!task) break;
    const agent = agentByKey(task.agent);
    if (!agent?.ready) {
      await store.finishTask(task.id, "bloqueada", { error: `El agente «${task.agent}» no está disponible` });
      done.push({ task: task.title, agent: task.agent, status: "bloqueada" });
      continue;
    }
    const r = await runAgent(store, modelFor(task.agent), task.agent, `Tarea: ${task.title}\n\n${task.instructions}`, task.id);
    const status = r.status === "ok" ? "hecha" : task.attempts >= task.maxAttempts ? "fallida" : "pendiente";
    await store.finishTask(task.id, status, { run: r.runId, estado: r.status, resumen: r.summary.slice(0, 2000) });
    done.push({ task: task.title, agent: task.agent, status });
    if (r.status === "sin_presupuesto") break;
  }
  return done;
}
