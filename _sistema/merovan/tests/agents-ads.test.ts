// Phase 5 acceptance: a simulated test respects the budget caps and an ad is paused only when it
// fails the criteria. The agent cannot pause a healthy ad or spend above the limits.
import { beforeEach, describe, expect, it } from "vitest";
import { type AdRow, reviewAd } from "@/lib/agents/ads";
import { demoModel } from "@/lib/agents/demo";
import { ScriptedModel, callTool, say } from "@/lib/agents/model";
import { decide } from "@/lib/agents/pipeline";
import { runAgent } from "@/lib/agents/runtime";
import { MemoryStore } from "@/lib/agents/store";

const ad = (over: Partial<AdRow>): AdRow => ({
  platform: "tiktok", campaign: "PRD-0001 test", ad: "CRE-0001", product: "PRD-0001", impressions: 0, clicks: 0, spend_cents: 0,
  purchases: 0, revenue_cents: 0, test_cap_cents: 5000, break_even_cpa_cents: 600, ...over,
});

describe("reviewAd", () => {
  it("pauses only on a failed criterion", () => {
    expect(reviewAd(ad({ impressions: 17000, clicks: 50, spend_cents: 1500 })).verdict).toBe("pausar");          // CTR 0,29 %
    expect(reviewAd(ad({ impressions: 6000, clicks: 120, spend_cents: 5000 })).verdict).toBe("pausar");          // cap with 0 sales
    expect(reviewAd(ad({ impressions: 6000, clicks: 120, spend_cents: 4000, purchases: 1 })).verdict).toBe("pausar"); // CPA 40 € > 3 × 6 €
    expect(reviewAd(ad({ impressions: 6000, clicks: 120, spend_cents: 1500, purchases: 2, revenue_cents: 3800 })).verdict).toBe("mantener");
    expect(reviewAd(ad({ impressions: 800, clicks: 2, spend_cents: 300 })).verdict).toBe("esperar");             // little data
  });
});

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  store.guardrails = { ai_monthly_budget: 3000, ads_daily_max: 2000, ads_weekly_max: 10000, ads_monthly_max: 30000, ads_product_max: 5000, ads_increase_max_pct: 20, min_margin_pct: 25 };
  store.ads = [
    ad({ ad: "CRE-0001", impressions: 17000, clicks: 50, spend_cents: 1500 }),
    ad({ ad: "CRE-0002", impressions: 6000, clicks: 120, spend_cents: 1500, purchases: 2, revenue_cents: 3800 }),
    ad({ ad: "CRE-0003", impressions: 700, clicks: 3, spend_cents: 200 }),
  ];
});

describe("phase 5: simulated ad test", () => {
  it("the demo pauses only the ad that fails the criteria, and the pause runs simulated after approval", async () => {
    expect((await runAgent(store, demoModel("anuncios"), "anuncios", "x")).status).toBe("ok");
    const proposals = [...store.proposals.values()];
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ action_type: "pausar_anuncio", payload: { ad: "CRE-0001" } });

    store.levels.set("anuncios:pausar_anuncio", 2);
    const again = await runAgent(store, demoModel("anuncios"), "anuncios", "x"); // same day: idempotent, no duplicate
    expect(again.status).toBe("ok");
    expect(store.proposals.size).toBe(1);
  });

  it("refuses to pause a healthy ad even if the agent insists", async () => {
    await runAgent(store, new ScriptedModel([
      () => ({ content: [callTool("proponer_pausa", { platform: "tiktok", campaign: "PRD-0001 test", ad: "CRE-0002" })] }),
      () => ({ content: [say("fin")] }),
    ]), "anuncios", "x");
    expect(store.proposals.size).toBe(0);
    expect(String(store.actions.find((a) => a.tool === "proponer_pausa")?.output)).toMatch(/No se pausa/);
  });

  it("budgets above the caps are blocked; within the caps they wait for approval and run simulated", async () => {
    store.levels.set("anuncios:presupuesto_anuncios", 3);
    const budget = (daily: number, current = 0) => callTool("proponer_presupuesto", { campaign: "PRD-0001 test", product: "PRD-0001", daily_cents: daily, current_daily_cents: current, reason: "Test inicial con 3 creatividades", margin_pct: 30 });
    await runAgent(store, new ScriptedModel([() => ({ content: [budget(5000), budget(1500, 1000), budget(1000)] }), () => ({ content: [say("fin")] })]), "anuncios", "x");
    const [over, bigIncrease, ok] = [...store.proposals.values()];
    expect(over.status).toBe("bloqueada");                          // 50 €/day > 20 €/day cap
    expect(bigIncrease.decision).not.toBe("ejecutar");               // +50 % > 20 % without approval
    expect(ok.status).toBe("simulada");                              // N3 within limits, dry-run → simulated
  });

  it("with money limits at 0 (initial state) no ad spend can go through", async () => {
    store.guardrails = { ai_monthly_budget: 3000, ads_daily_max: 0, ads_weekly_max: 0, ads_monthly_max: 0, ads_product_max: 0 };
    store.levels.set("anuncios:presupuesto_anuncios", 2);
    await runAgent(store, new ScriptedModel([
      () => ({ content: [callTool("proponer_presupuesto", { campaign: "Campaña test", product: "PRD-0001", daily_cents: 500, reason: "Test pequeño de prueba" })] }),
      () => ({ content: [say("fin")] }),
    ]), "anuncios", "x");
    const [p] = [...store.proposals.values()];
    expect(p.status).toBe("bloqueada");
    await expect(decide(store, p.id, true, { role: "owner" })).rejects.toThrow();
  });

  it("the analyst runs the decision engine and cannot propose spend", async () => {
    store.decisions = [{ code: "PRD-0001", decision: "arreglar" }];
    const r = await runAgent(store, demoModel("analista"), "analista", "x");
    expect(r.summary).toMatch(/PRD-0001: arreglar/);
    await runAgent(store, new ScriptedModel([
      () => ({ content: [callTool("proponer_presupuesto", { campaign: "Campaña test", product: "PRD-0001", daily_cents: 500, reason: "no debería poder" })] }),
      () => ({ content: [say("fin")] }),
    ]), "analista", "x");
    expect(store.proposals.size).toBe(0);
  });
});
