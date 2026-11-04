import { describe, expect, it } from "vitest";
import { EMPTY_USAGE, type Guardrails, evaluateAction, promotionAdvice } from "@/lib/agents/policy";

const g: Guardrails = {
  ads_daily_max: 2000, ads_weekly_max: 10000, ads_monthly_max: 30000, ads_product_max: 5000, ads_increase_max_pct: 20,
  samples_weekly_max: 5000, supplier_daily_max: 20000, price_change_daily_max_pct: 10, min_margin_pct: 25,
  products_published_week_max: 2, organic_posts_day_max: 2, refund_no_approval_max: 1000,
};
const live = { killSwitch: false, dryRun: false };

describe("autonomy levels", () => {
  it("N0 blocks, N1 drafts, N2 waits for approval, N3 executes within limits", () => {
    const base = { actionType: "pausar_anuncio", payload: {}, guardrails: g, state: live };
    expect(evaluateAction({ ...base, level: 0 }).decision).toBe("bloquear");
    expect(evaluateAction({ ...base, level: 1 }).decision).toBe("borrador");
    expect(evaluateAction({ ...base, level: 2 }).decision).toBe("aprobacion");
    expect(evaluateAction({ ...base, level: 3 }).decision).toBe("ejecutar");
  });

  it("dry-run turns N3 external execution into a simulation", () => {
    expect(evaluateAction({ actionType: "pausar_anuncio", level: 3, payload: {}, guardrails: g, state: { killSwitch: false, dryRun: true } }).decision).toBe("simular");
  });

  it("internal actions run even in dry-run", () => {
    expect(evaluateAction({ actionType: "crear_borrador_producto", level: 3, payload: {}, guardrails: g, state: { killSwitch: false, dryRun: true } }).decision).toBe("ejecutar");
  });

  it("actions that always need a human never go above N2", () => {
    const r = evaluateAction({ actionType: "mensaje_nuevo_contacto", level: 3, payload: {}, guardrails: g, state: live });
    expect(r.decision).toBe("aprobacion");
    expect(r.reasons[0]).toMatch(/aprobación humana/);
  });

  it("agents can never change limits or autonomy", () => {
    expect(evaluateAction({ actionType: "cambiar_limites", level: 3, payload: {}, guardrails: g, state: live }).decision).toBe("bloquear");
  });

  it("unknown actions are blocked", () => {
    expect(evaluateAction({ actionType: "transferir_dinero", level: 3, payload: {}, guardrails: g, state: live }).decision).toBe("bloquear");
  });
});

describe("kill switch", () => {
  it("blocks every external action, at any level", () => {
    for (const level of [1, 2, 3]) {
      const r = evaluateAction({ actionType: "pausar_anuncio", level, payload: {}, guardrails: g, state: { killSwitch: true, dryRun: false } });
      expect(r).toMatchObject({ decision: "bloquear", reasons: ["Parada global activa"] });
    }
  });
});

describe("hard limits", () => {
  it("blocks an ad budget above the daily limit", () => {
    const r = evaluateAction({ actionType: "presupuesto_anuncios", level: 3, payload: { amount_cents: 1500 }, guardrails: g, state: live,
      usage: { ...EMPTY_USAGE, adsToday: 800 } });
    expect(r.decision).toBe("bloquear");
    expect(r.reasons[0]).toBe("Gasto diario en anuncios: 23,00 € supera el límite de 20,00 €");
  });

  it("money limits at 0 (default) block any spend", () => {
    const r = evaluateAction({ actionType: "pedido_muestra", level: 3, payload: { amount_cents: 1 }, guardrails: {}, state: live });
    expect(r.decision).toBe("bloquear");
  });

  it("blocks publishing below the minimum margin or without a margin", () => {
    expect(evaluateAction({ actionType: "publicar_producto", level: 3, payload: { margin_pct: 20 }, guardrails: g, state: live }).reasons[0]).toMatch(/por debajo del mínimo 25/);
    expect(evaluateAction({ actionType: "publicar_producto", level: 3, payload: {}, guardrails: g, state: live }).reasons[0]).toMatch(/Falta el margen/);
  });

  it("blocks a price change larger than the daily maximum", () => {
    const r = evaluateAction({ actionType: "cambiar_precio", level: 3, payload: { old_price_cents: 2000, new_price_cents: 2400, margin_pct: 40 }, guardrails: g, state: live });
    expect(r.reasons[0]).toMatch(/20.0 % supera el máximo diario del 10 %/);
  });

  it("blocks organic posts over the daily maximum", () => {
    const r = evaluateAction({ actionType: "publicar_contenido", level: 3, payload: {}, guardrails: g, state: live, usage: { ...EMPTY_USAGE, postsToday: 2 } });
    expect(r.decision).toBe("bloquear");
  });
});

describe("soft limits fall back to N2", () => {
  it("a budget increase above the allowed % needs approval even at N3", () => {
    const r = evaluateAction({ actionType: "presupuesto_anuncios", level: 3, payload: { amount_cents: 500, increase_pct: 50 }, guardrails: g, state: live });
    expect(r.decision).toBe("aprobacion");
  });

  it("a refund above the limit needs approval; a small one runs at N3", () => {
    expect(evaluateAction({ actionType: "reembolso", level: 3, payload: { amount_cents: 2000 }, guardrails: g, state: live }).decision).toBe("aprobacion");
    expect(evaluateAction({ actionType: "reembolso", level: 3, payload: { amount_cents: 500 }, guardrails: g, state: live }).decision).toBe("ejecutar");
  });

  it("a customer reply with an economic commitment needs approval", () => {
    expect(evaluateAction({ actionType: "responder_cliente", level: 3, payload: { economic_commitment: true }, guardrails: g, state: live }).decision).toBe("aprobacion");
  });
});

describe("promotion advice", () => {
  it("recommends promoting after enough clean approvals, never decides", () => {
    expect(promotionAdvice({ level: 1, approved: 10, rejected: 0 }, 10)).toMatch(/subir a N2/);
    expect(promotionAdvice({ level: 1, approved: 10, rejected: 3 }, 10)).toBeNull();
    expect(promotionAdvice({ level: 3, approved: 50, rejected: 0 }, 10)).toBeNull();
  });
});
