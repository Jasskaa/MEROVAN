// Phase 6 acceptance: the real profit of a case with a return matches the manual calculation,
// reconciliation finds the inconsistencies, and operations never refund or promise money on its own.
import { beforeEach, describe, expect, it } from "vitest";
import { demoModel } from "@/lib/agents/demo";
import { ScriptedModel, callTool, say } from "@/lib/agents/model";
import { decide } from "@/lib/agents/pipeline";
import { reconcile } from "@/lib/agents/ops";
import { runAgent } from "@/lib/agents/runtime";
import { MemoryStore } from "@/lib/agents/store";
import type { ProfitOrder } from "@/lib/domain/profit";

// Two orders of PRD-0001 at 24,20 € (VAT incl., 21 %) + 3,63 € shipping. Order 2 is returned and refunded.
const order = (id: string, over: Partial<ProfitOrder> = {}): ProfitOrder => ({
  id, channel: "web", status: "entregado", shippingCents: 363, platformFeeCents: 0, paymentFeeCents: 64,
  items: [{ productId: "p1", quantity: 1, unitPriceCents: 2420, vatRate: 0.21, unitCostCents: 900 }],
  supplierCostCents: 900, refundCents: 0, returnCostCents: 0, chargebackLossCents: 0, ...over,
});

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  store.guardrails = { ai_monthly_budget: 3000, supplier_daily_max: 5000, refund_no_approval_max: 1000 };
  store.fin = {
    orders: [order("o1"), order("o2", { status: "reembolsado", refundCents: 2783, returnCostCents: 450 })],
    adSpend: { p1: 1000 }, expensesCents: 2000, codes: { p1: "PRD-0001" }, recon: [],
  };
});

describe("phase 6: real profit with a return", () => {
  it("matches the manual calculation", async () => {
    // Manual, without VAT, per order: sales 20,00 + shipping 3,00 = 23,00 €.
    //   2 orders: net sales 46,00 · refund of order 2: 27,83 / 1,21 = 23,00 · cost 2 × 9,00 = 18,00
    //   payment fees 2 × 0,64 = 1,28 · return cost 4,50 · ads 10,00
    //   profit = 46,00 − 23,00 − 18,00 − 1,28 − 4,50 − 10,00 = −10,78 €; net after 20,00 € overheads = −30,78 €
    const model = new ScriptedModel([
      () => ({ content: [callTool("beneficio_real", { from: "2026-11-01", to: "2026-11-30", by: "product" })] }),
      () => ({ content: [say("fin")] }),
    ]);
    await runAgent(store, model, "finanzas", "x");
    const out = store.actions.find((a) => a.tool === "beneficio_real")?.output as { lineas: { key: string; netSalesCents: number; refundsCents: number; cogsCents: number; profitCents: number }[]; beneficio_neto_cents: number };
    expect(out.lineas[0]).toMatchObject({ key: "PRD-0001", netSalesCents: 4600, refundsCents: 2300, cogsCents: 1800, profitCents: -1078 });
    expect(out.beneficio_neto_cents).toBe(-3078);
  });

  it("the finance demo reports the same figures and the agent cannot propose payments", async () => {
    const r = await runAgent(store, demoModel("finanzas"), "finanzas", "x");
    expect(r.summary).toMatch(/beneficio de contribución -10,78 €/);
    expect(r.summary).toMatch(/beneficio neto -30,78 €/);
    await runAgent(store, new ScriptedModel([
      () => ({ content: [callTool("proponer_accion", { action_type: "pagos_banco", title: "Pagar", reason: "no debería poder hacerlo", payload: {} })] }),
      () => ({ content: [say("fin")] }),
    ]), "finanzas", "x");
    expect(store.proposals.size).toBe(0);
  });
});

describe("reconciliation", () => {
  it("flags missing payment refs, unrecorded refunds, over-refunds and missing supplier costs", () => {
    const base = { channel: "web", total_cents: 2783, payment_ref: "cs_1", external_ref: null, supplier_cost_cents: 900, refunded_cents: 0 };
    const issues = reconcile([
      { ...base, number: 1, status: "entregado" },
      { ...base, number: 2, status: "pagado", payment_ref: null },
      { ...base, number: 3, status: "reembolsado" },
      { ...base, number: 4, status: "reembolsado", refunded_cents: 3000 },
      { ...base, number: 5, status: "enviado", supplier_cost_cents: null },
      { ...base, number: 6, status: "pagado", channel: "tiktok_shop", payment_ref: null },
    ]);
    expect(issues.map((i) => i.order)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe("operations", () => {
  beforeEach(() => {
    store.ops = {
      sin_pedido_proveedor: [{ number: 1001, total_cents: 2783, coste_estimado_cents: 900, pagado: "2026-11-04T10:00:00Z" }],
      retrasados: [],
      tickets_abiertos: [{ number: 7, type: "devolucion", subject: "Quiero devolverlo", pedido: 1001, abierto: "2026-11-04T10:00:00Z", sin_respuesta: true }],
      devoluciones: [
        { id: "r1", pedido: 1001, status: "recibida", refund_cents: 2783, reason: "No le gusta" },
        { id: "r2", pedido: 1002, status: "solicitada", refund_cents: 1500, reason: "Aún no llega" },
      ],
    };
  });

  it("demo proposes the supplier order and the refund of the received return only", async () => {
    await runAgent(store, demoModel("operaciones"), "operaciones", "x");
    const types = [...store.proposals.values()].map((p) => p.action_type).sort();
    expect(types).toEqual(["pedido_proveedor", "reembolso"]);
  });

  it("refunds above the no-approval limit always need Jaska, and a not-received return is refused", async () => {
    store.levels.set("operaciones:reembolso", 3);
    await runAgent(store, new ScriptedModel([
      () => ({ content: [callTool("proponer_reembolso", { return_id: "r1", reason: "Recibida en buen estado" }), callTool("proponer_reembolso", { return_id: "r2", reason: "Adelantar el reembolso" })] }),
      () => ({ content: [say("fin")] }),
    ]), "operaciones", "x");
    const [p] = [...store.proposals.values()];
    expect(store.proposals.size).toBe(1);
    expect(p.decision).toBe("aprobacion");                 // 27,83 € > 10 € without approval → N3 falls back to approval
    expect(String(store.actions.find((a) => a.outcome === "error")?.output)).toMatch(/solo se reembolsa cuando/);
    expect(await decide(store, p.id, true, { role: "owner" })).toBe("simulada");
  });

  it("a reply that promises money waits for approval even at N3", async () => {
    store.levels.set("operaciones:responder_cliente", 3);
    await runAgent(store, new ScriptedModel([
      () => ({ content: [callTool("proponer_respuesta", { ticket: 7, text: "Hola, te reembolsamos el importe completo en cuanto recibamos el paquete.", economic_commitment: true })] }),
      () => ({ content: [say("fin")] }),
    ]), "operaciones", "x");
    const [p] = [...store.proposals.values()];
    expect(p.decision).toBe("aprobacion");
  });
});
