// Phase 3 acceptance: a product listing is written, validated, proposed, approved and published in
// the own store, and every shortcut (claims, published listings, invalid listing, kill switch) is refused.
import { beforeEach, describe, expect, it } from "vitest";
import { ScriptedModel, callTool, say } from "@/lib/agents/model";
import { decide, propose } from "@/lib/agents/pipeline";
import { runAgent } from "@/lib/agents/runtime";
import { MemoryStore } from "@/lib/agents/store";

const COMPLETE = {
  gpsrManufacturer: "Fabricante S.L.", gpsrAddress: "Calle Mayor 1, Madrid", gpsrContact: "hola@fabricante.es",
  imageCount: 3, videoCount: 1, variants: [{ sku: "PRD-0001-U", stock: 10 }],
};
const TEXT = {
  description: "Bandeja metálica que se atornilla bajo la mesa y recoge regletas y cables. Mide 40 cm e incluye tornillos.",
  bullets: ["Acero con pintura en polvo", "Para regletas de hasta 6 tomas", "Montaje en 5 minutos"],
};

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  store.guardrails = { ai_monthly_budget: 3000, min_margin_pct: 25, products_published_week_max: 2, price_change_daily_max_pct: 10 };
  store.products.push({ code: "PRD-0001", name: "Bandeja pasacables", status: "validado", publish_status: "borrador", price_cents: 1895, listing: COMPLETE });
  store.products.push({ code: "PRD-0002", name: "Ya publicado", status: "en_test", publish_status: "publicado", price_cents: 1295, listing: COMPLETE });
});

const run = (calls: ReturnType<typeof callTool>[]) =>
  runAgent(store, new ScriptedModel([() => ({ content: calls }), () => ({ content: [say("fin")] })]), "fichas", "x");

describe("phase 3: listing → validation → approval → publication", () => {
  it("writes the listing, proposes publication and publishes only after approval with dry-run off", async () => {
    await run([callTool("redactar_ficha", { code: "PRD-0001", ...TEXT })]);
    expect(store.products[0].description).toBe(TEXT.description);

    store.levels.set("fichas:publicar_producto", 2);
    const p = await propose(store, { agent: "fichas", runId: null, taskId: null, actionType: "publicar_producto", title: "Publicar PRD-0001", reason: "Ficha validada y margen del 27 %", payload: { code: "PRD-0001", margin_pct: 27, ...TEXT } });
    expect(p).toMatchObject({ status: "pendiente", decision: "aprobacion" });
    expect(store.products[0].publish_status).toBe("borrador");

    expect(await decide(store, p.id, true, { role: "owner" })).toBe("simulada"); // dry-run on by default
    expect(store.products[0].publish_status).toBe("borrador");

    store.state.dryRun = false;
    const p2 = await propose(store, { agent: "fichas", runId: null, taskId: null, actionType: "publicar_producto", title: "Publicar PRD-0001", reason: "Ficha validada y margen del 27 %", payload: { code: "PRD-0001", margin_pct: 27, ...TEXT } });
    expect(await decide(store, p2.id, true, { role: "owner" })).toBe("ejecutada");
    expect(store.products[0].publish_status).toBe("publicado");
  });

  it("rejects medical claims and never edits a published listing directly", async () => {
    await run([
      callTool("redactar_ficha", { code: "PRD-0001", description: "Esta bandeja cura el estrés de tu escritorio desordenado para siempre, garantizado.", bullets: ["a b c", "d e f", "g h i"] }),
      callTool("redactar_ficha", { code: "PRD-0002", ...TEXT }),
    ]);
    const errors = store.actions.filter((a) => a.tool === "redactar_ficha").map((a) => String(a.output));
    expect(errors[0]).toMatch(/rechazado/i);
    expect(errors[1]).toMatch(/publicado/);
    expect(store.products[0].description).toBeUndefined();
  });

  it("an approved publication fails if the live listing is invalid at execution time", async () => {
    store.state.dryRun = false;
    store.products[0].listing = { ...COMPLETE, imageCount: 0 };
    store.products[0].description = TEXT.description;
    store.levels.set("fichas:publicar_producto", 2);
    const p = await propose(store, { agent: "fichas", runId: null, taskId: null, actionType: "publicar_producto", title: "Publicar", reason: "Ficha validada y margen del 27 %", payload: { code: "PRD-0001", margin_pct: 27 } });
    expect(await decide(store, p.id, true, { role: "owner" })).toBe("fallida");
    expect(store.products[0].publish_status).toBe("borrador");
    expect(store.proposals.get(p.id)?.result).toMatchObject({ error: expect.stringMatching(/foto/) });
  });

  it("price changes on published products respect the kill switch", async () => {
    store.state.dryRun = false;
    store.levels.set("precios:cambiar_precio", 2);
    store.products[1].description = TEXT.description;
    const change = { agent: "precios", runId: null, taskId: null, actionType: "cambiar_precio", title: "Subir precio", reason: "Margen por debajo del objetivo", payload: { code: "PRD-0002", old_price_cents: 1295, new_price_cents: 1395, margin_pct: 30 } };
    const p = await propose(store, change);
    await store.setKillSwitch(true, "prueba", false);
    expect(await decide(store, p.id, true, { role: "owner" })).toBe("bloqueada");
    expect(store.products[1].price_cents).toBe(1295);
    await store.setKillSwitch(false, "prueba", false);
    const again = await propose(store, change);
    expect(await decide(store, again.id, true, { role: "owner" })).toBe("ejecutada");
    expect(store.products[1].price_cents).toBe(1395);
  });
});
