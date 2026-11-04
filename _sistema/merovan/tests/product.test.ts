import { describe, expect, it } from "vitest";
import { scorePasses, scoreTotal, transitionBlockers, type TransitionContext } from "@/lib/domain/product";

// PRD-0001 example scorecard from the vault: total 31/40.
const example = { demanda: 4, visual: 5, problema: 4, margen: 3, competencia: 3, logistica: 5, riesgo_legal: 5, recompra: 2 };

const ready: TransitionContext = {
  scores: example,
  legal: { ce: "no_aplica", gpsr: "ok", marca: "ok" },
  hasApprovedSample: true,
  sampleException: null,
  hasBackupSupplier: true,
  gpsrComplete: true,
  hasPrice: true,
};

describe("scorecard", () => {
  it("sums equal weights to the vault example (31/40)", () => {
    expect(scoreTotal(example)).toBe(31);
    expect(scorePasses(example).passes).toBe(true);
  });

  it("normalises weighted scores to 40", () => {
    // Doubling 'demanda' (4) weight: (31 + 4) / 9 * 8 = 31.1
    expect(scoreTotal(example, { demanda: 2 })).toBe(31.1);
  });

  it("fails when legal risk is below 3 even with a high total", () => {
    const r = scorePasses({ ...example, riesgo_legal: 2, recompra: 5 });
    expect(r.total).toBeGreaterThanOrEqual(28);
    expect(r.passes).toBe(false);
    expect(r.reasons[0]).toMatch(/Riesgo legal/);
  });

  it("clamps scores to 0-5", () => {
    expect(scoreTotal({ demanda: 9 })).toBe(5);
  });
});

describe("status transitions", () => {
  it("allows a fully validated product to scale", () => {
    expect(transitionBlockers("escalando", ready)).toEqual([]);
  });

  it("blocks any progress with a legal red flag, but allows discarding", () => {
    const ctx = { ...ready, legal: { ...ready.legal, marca: "rojo" as const } };
    expect(transitionBlockers("validando_proveedor", ctx)[0]).toMatch(/bandera roja/);
    expect(transitionBlockers("descartado", ctx)).toEqual([]);
  });

  it("requires an approved sample before publishing, unless an exception is justified", () => {
    const ctx = { ...ready, hasApprovedSample: false };
    expect(transitionBlockers("listo_para_publicar", ctx)).toContain("Falta una muestra aprobada (o una excepción justificada).");
    expect(transitionBlockers("listo_para_publicar", { ...ctx, sampleException: "Proveedor ya probado en PRD-0001" })).toEqual([]);
    expect(transitionBlockers("muestra_pedida", ctx)).toEqual([]);
  });

  it("requires a backup supplier to scale", () => {
    expect(transitionBlockers("escalando", { ...ready, hasBackupSupplier: false })).toEqual(["Falta un proveedor de respaldo."]);
  });

  it("requires GPSR and price before publishing", () => {
    const r = transitionBlockers("listo_para_publicar", { ...ready, gpsrComplete: false, hasPrice: false });
    expect(r).toHaveLength(2);
  });
});
