// Phase 7: whole-system checks. Every agent is wired correctly, the task queue runs delegated work
// safely, and the global rules hold for all twelve agents.
import { beforeEach, describe, expect, it } from "vitest";
import { AGENTS } from "@/lib/agents/agents";
import { demoModel } from "@/lib/agents/demo";
import { ScriptedModel, callTool, say } from "@/lib/agents/model";
import { ACTION_TYPES } from "@/lib/agents/policy";
import { runPendingTasks } from "@/lib/agents/queue";
import { runAgent } from "@/lib/agents/runtime";
import { MemoryStore } from "@/lib/agents/store";
import { TOOLS } from "@/lib/agents/tools";

describe("agent catalogue", () => {
  it("has the twelve agents ready, each with existing tools and the shared rules", () => {
    expect(AGENTS).toHaveLength(12);
    for (const a of AGENTS) {
      expect(a.ready, a.key).toBe(true);
      for (const t of a.tools) expect(TOOLS.some((x) => x.name === t), `${a.key}:${t}`).toBe(true);
      expect(a.system).toMatch(/datos_externos/);
      expect(a.system).toMatch(/No inventas reseñas/);
    }
  });
  it("only compliance can veto, and the finance agent cannot propose actions", () => {
    expect(AGENTS.filter((a) => a.tools.includes("emitir_veredicto")).map((a) => a.key)).toEqual(["cumplimiento"]);
    const finance = AGENTS.find((a) => a.key === "finanzas")!;
    expect(finance.tools.some((t) => t.startsWith("proponer"))).toBe(false);
  });
  it("actions only people can take are not proposable by agents through the policy", () => {
    expect(ACTION_TYPES.filter((a) => a.agentsForbidden).map((a) => a.key)).toEqual(["cambiar_limites"]);
  });
  it("every tool has a JSON schema matching its required fields", () => {
    for (const t of TOOLS) expect(t.jsonSchema.type, t.name).toBe("object");
  });
});

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  store.guardrails = { ai_monthly_budget: 3000, min_margin_pct: 25, price_min_cents: 995, price_max_cents: 4995 };
});

describe("task queue", () => {
  it("runs the tasks the orchestrator delegates, once", async () => {
    await runAgent(store, new ScriptedModel([
      () => ({ content: [callTool("crear_tarea", { agent: "investigador", title: "Investigar 3 nichos", instructions: "Tres nichos", dedupe_key: "nichos-S45" })] }),
      () => ({ content: [say("Delegado")] }),
    ]), "orquestador", "Planifica");
    const done = await runPendingTasks(store, demoModel);
    expect(done).toEqual([{ task: "Investigar 3 nichos", agent: "investigador", status: "hecha" }]);
    expect(store.niches).toHaveLength(3);
    expect(await runPendingTasks(store, demoModel)).toEqual([]); // nothing left: never runs twice
  });

  it("waits while the kill switch is on and retries a failed run up to the limit", async () => {
    await store.createTask({ agent: "investigador", title: "Tarea", instructions: "x" });
    await store.setKillSwitch(true, "prueba", false);
    expect(await runPendingTasks(store, demoModel)).toEqual([]);
    await store.setKillSwitch(false, "prueba", false);

    const failing = () => new ScriptedModel([() => ({ content: [say("x")], stop_reason: "refusal" })]);
    expect(await runPendingTasks(store, failing)).toEqual([{ task: "Tarea", agent: "investigador", status: "pendiente" }]); // attempt 1 of 2, waits
    expect(await runPendingTasks(store, failing)).toEqual([]);                    // still waiting before the retry
    store.tasks[0].lockedUntil = 0;                                               // 10 minutes later
    expect((await runPendingTasks(store, failing))[0].status).toBe("fallida");   // attempt 2 of 2
    expect(await runPendingTasks(store, failing)).toEqual([]);
  });

  it("blocks tasks for unknown agents and stops when the AI budget is exhausted", async () => {
    store.tasks.push({ id: "t-x", agent: "desconocido", title: "Rara", instructions: "", status: "pendiente" });
    expect((await runPendingTasks(store, demoModel))[0].status).toBe("bloqueada");

    store.cost = 3000 * 10_000;
    await store.createTask({ agent: "investigador", title: "A", instructions: "" });
    await store.createTask({ agent: "investigador", title: "B", instructions: "" });
    const done = await runPendingTasks(store, demoModel);
    expect(done).toHaveLength(1);
    expect(store.niches).toHaveLength(0);
  });
});
