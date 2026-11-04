// Phase 2 acceptance: 3 niches with scored candidates, main/backup supplier and a price inside
// the allowed range with a computed margin. Figures always come from the system, never the model.
import { beforeEach, describe, expect, it } from "vitest";
import { demoModel } from "@/lib/agents/demo";
import { ScriptedModel, callTool, say } from "@/lib/agents/model";
import { marginAt, rankOffers, recommendPrice } from "@/lib/agents/research";
import { runAgent } from "@/lib/agents/runtime";
import { DEFAULT_MARGIN, MemoryStore } from "@/lib/agents/store";

const LIMITS = { minMarginPct: 25, priceMinCents: 995, priceMaxCents: 4995 };
const offer = (supplier: string, country: string, cost: number, ship: number, days: number, source = "https://catalogo.example/sku") =>
  ({ supplier, warehouse_country: country, unit_cost_cents: cost, shipping_cents: ship, promised_days: days, source });

describe("rankOffers", () => {
  it("puts an EU warehouse first even if a non-EU one is cheaper, and picks a different backup", () => {
    const plan = rankOffers([offer("Fábrica CN", "CN", 200, 300, 14), offer("Mayorista ES", "ES", 500, 400, 3), offer("Almacén DE", "DE", 450, 500, 5)]);
    expect(plan.principal?.supplier).toBe("Mayorista ES");
    expect(plan.respaldo?.supplier).toBe("Almacén DE");
    expect(plan.real_data).toBe(true);
    expect(plan.warnings).toEqual([]);
  });
  it("warns without backup, without EU warehouse and with estimated figures", () => {
    const plan = rankOffers([offer("Solo CN", "cn", 200, 300, 15, "estimacion")]);
    expect(plan.respaldo).toBeNull();
    expect(plan.real_data).toBe(false);
    expect(plan.warnings.join(" ")).toMatch(/UE/);
    expect(plan.warnings.join(" ")).toMatch(/respaldo/);
    expect(plan.warnings.join(" ")).toMatch(/estimad/);
  });
});

describe("recommendPrice", () => {
  it("returns the lowest x,95 price in range that reaches the minimum margin", () => {
    const r = recommendPrice(900, DEFAULT_MARGIN, LIMITS);
    expect(r.ok).toBe(true);
    expect(r.price_cents! % 100).toBe(95);
    expect(r.margin_pct!).toBeGreaterThanOrEqual(25);
    // one euro less would not reach the minimum
    expect(marginAt(r.price_cents! - 100, 900, DEFAULT_MARGIN).marginPct * 100).toBeLessThan(25);
  });
  it("refuses a price when not even the maximum reaches the margin, or the range is not set", () => {
    expect(recommendPrice(4000, DEFAULT_MARGIN, LIMITS)).toMatchObject({ ok: false, price_cents: null });
    expect(recommendPrice(500, DEFAULT_MARGIN, { ...LIMITS, priceMaxCents: 0 }).reasons[0]).toMatch(/no configurado/);
  });
});

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  store.guardrails = { ai_monthly_budget: 3000, min_margin_pct: 25, price_min_cents: 995, price_max_cents: 4995 };
});

describe("phase 2 chain (simulation)", () => {
  it("investigator → suppliers → pricing delivers 3 niches with scored candidates, plans and prices", async () => {
    expect((await runAgent(store, demoModel("investigador"), "investigador", "Investiga")).status).toBe("ok");
    expect(store.niches).toHaveLength(3);
    expect(store.candidates).toHaveLength(6);
    expect(store.candidates.every((c) => c.demo && c.score_total > 0)).toBe(true);

    expect((await runAgent(store, demoModel("proveedores"), "proveedores", "Proveedores")).status).toBe("ok");
    const passing = store.candidates.filter((c) => c.passes);
    expect(passing.length).toBeGreaterThan(0);
    for (const c of passing) {
      const plan = c.supplier_plan as { principal: { warehouse_country: string }; respaldo: unknown };
      expect(plan.principal.warehouse_country).toBe("ES");
      expect(plan.respaldo).not.toBeNull();
      expect(c.real_data).toBe(false); // example figures are never "verified"
    }

    expect((await runAgent(store, demoModel("precios"), "precios", "Precios")).status).toBe("ok");
    for (const c of passing) {
      expect(c.price_cents).toBeGreaterThanOrEqual(995);
      expect(c.price_cents).toBeLessThanOrEqual(4995);
      expect(c.margin_pct).toBeGreaterThanOrEqual(25);
    }
  });

  it("the score is computed by the system: a low legal score fails whatever the agent says", async () => {
    const model = new ScriptedModel([
      () => ({ content: [callTool("registrar_nicho", { name: "Test", thesis: "Una tesis de prueba suficiente", audience: "", evidence: ["hipótesis sin verificar"], risks: [], confidence: "baja" })] }),
      (req) => {
        const last = req.messages[req.messages.length - 1].content as { content: string }[];
        const { niche_id } = JSON.parse(last[0].content);
        return { content: [callTool("guardar_candidato", { niche_id, name: "Crema milagro", description: "x", scores: { demanda: 5, visual: 5, problema: 5, margen: 5, competencia: 5, logistica: 5, riesgo_legal: 1, recompra: 5 } })] };
      },
      () => ({ content: [say("Hecho")] }),
    ]);
    await runAgent(store, model, "investigador", "x");
    expect(store.candidates[0]).toMatchObject({ passes: false });
    expect(store.candidates[0].score_reasons.join()).toMatch(/Riesgo legal/);
  });

  it("pricing cannot invent a margin: no plan, no price; and agents cannot use other agents' tools", async () => {
    const nicheId = await store.createNiche({ name: "N", thesis: "t", audience: "", evidence: [], risks: [], confidence: "baja", demo: true, agent: "x", runId: null });
    const cand = await store.addCandidate({ niche_id: nicheId, name: "C", description: "", scores: {}, score_total: 30, passes: true, score_reasons: [], demo: true });
    const model = new ScriptedModel([
      () => ({ content: [callTool("guardar_precio", { candidate_id: cand }), callTool("registrar_nicho", { name: "Intruso", thesis: "no debería poder", audience: "", evidence: ["x"], risks: [], confidence: "baja" })] }),
      () => ({ content: [say("fin")] }),
    ]);
    await runAgent(store, model, "precios", "x");
    expect(store.candidates[0].price_cents).toBeNull();
    expect(store.actions.find((a) => a.tool === "guardar_precio")).toMatchObject({ outcome: "error" });
    expect(store.actions.find((a) => a.tool === "registrar_nicho")).toMatchObject({ outcome: "bloqueada" });
    expect(store.niches).toHaveLength(1);
  });
});
