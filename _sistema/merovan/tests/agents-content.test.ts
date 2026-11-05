// Phase 4 acceptance: pieces are generated and scheduled in simulation; nothing is published without
// passing the proposal pipeline, daily caps hold, unlabelled AI and fake social proof are stopped.
import { beforeEach, describe, expect, it } from "vitest";
import { demoModel } from "@/lib/agents/demo";
import { ScriptedModel, callTool, say } from "@/lib/agents/model";
import { decide } from "@/lib/agents/pipeline";
import { runAgent } from "@/lib/agents/runtime";
import { MemoryStore } from "@/lib/agents/store";

const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  store.guardrails = { ai_monthly_budget: 3000, organic_posts_day_max: 1 };
  store.products.push({ code: "PRD-0001", name: "Bandeja pasacables", status: "en_test", publish_status: "publicado", price_cents: 1895 });
});

const once = (agent: string, calls: ReturnType<typeof callTool>[]) =>
  runAgent(store, new ScriptedModel([() => ({ content: calls }), () => ({ content: [say("fin")] })]), agent, "x");

describe("phase 4: content and publishing", () => {
  it("demo runs generate scripts, creatives and scheduled posts that wait for approval", async () => {
    expect((await runAgent(store, demoModel("contenido"), "contenido", "x")).status).toBe("ok");
    expect(store.scripts).toHaveLength(2);
    expect(store.creatives).toHaveLength(2);
    expect(store.creatives.every((c) => c.ejemplo && c.script)).toBe(true);

    store.guardrails.organic_posts_day_max = 2;
    expect((await runAgent(store, demoModel("publicacion"), "publicacion", "x")).status).toBe("ok");
    expect(store.calendar).toHaveLength(2);
    const proposals = [...store.proposals.values()];
    expect(proposals).toHaveLength(2);
    expect(proposals.every((p) => p.action_type === "publicar_contenido" && p.status === "pendiente")).toBe(true);
    expect(store.calendar.every((c) => c.proposal_id)).toBe(true);
  });

  it("with N2 an approved post runs simulated in dry-run and fails clearly without the integration", async () => {
    await once("contenido", [callTool("crear_creatividad", { code: "PRD-0001", hook: "Gancho de prueba", angle: "demostracion", platforms: ["tiktok"], contains_ai: false })]);
    store.levels.set("publicacion:publicar_contenido", 2);
    await once("publicacion", [callTool("programar_publicacion", { day: tomorrow, platform: "tiktok", creative: "CRE-0001", title: "Post", caption: "Así se monta en 5 minutos #orden", ai_labelled: false })]);
    const [p] = [...store.proposals.values()];
    expect(p).toMatchObject({ decision: "aprobacion", status: "pendiente" });
    expect(await decide(store, p.id, true, { role: "owner" })).toBe("simulada");

    store.state.dryRun = false;
    store.guardrails.organic_posts_day_max = 2;
    await once("publicacion", [callTool("programar_publicacion", { day: tomorrow, platform: "tiktok", creative: "CRE-0001", title: "Post 2", caption: "Otro ángulo del producto #orden", ai_labelled: false })]);
    const p2 = [...store.proposals.values()][1];
    expect(await decide(store, p2.id, true, { role: "owner" })).toBe("fallida");
    expect(store.proposals.get(p2.id)?.result).toMatchObject({ error: expect.stringMatching(/Integración no conectada/) });
  });

  it("enforces the daily cap, refuses past dates and blocks fake social proof in scripts", async () => {
    await once("contenido", [
      callTool("crear_creatividad", { code: "PRD-0001", hook: "Gancho", angle: "problema", platforms: ["tiktok"], contains_ai: false }),
      callTool("crear_guion", { code: "PRD-0001", angle: "problema", hook: "Más de 10.000 clientes satisfechos", problem: "x", demo: "x", proof: "Miles de reseñas de 5 estrellas", offer: "Solo hoy, últimas unidades", cta: "Compra ya", contains_ai: false }),
    ]);
    expect(store.scripts).toHaveLength(0);
    expect(String(store.actions.find((a) => a.tool === "crear_guion")?.output)).toMatch(/rechazado/i);

    const post = (day: string, title: string) => callTool("programar_publicacion", { day, platform: "tiktok", creative: "CRE-0001", title, caption: "Texto del post #orden", ai_labelled: false });
    await once("publicacion", [post(tomorrow, "Uno"), post(tomorrow, "Dos"), post("2020-01-01", "Pasado")]);
    expect(store.calendar).toHaveLength(1);
    const errors = store.actions.filter((a) => a.tool === "programar_publicacion" && a.outcome === "error").map((a) => String(a.output));
    expect(errors[0]).toMatch(/máximo 1/);
    expect(errors[1]).toMatch(/pasado/);
  });

  it("AI content without a label is vetoed by compliance", async () => {
    await once("contenido", [callTool("crear_creatividad", { code: "PRD-0001", hook: "Gancho IA", angle: "demostracion", platforms: ["tiktok"], contains_ai: true })]);
    await once("publicacion", [callTool("programar_publicacion", { day: tomorrow, platform: "tiktok", creative: "CRE-0001", title: "Pieza IA", caption: "Mira qué fácil #orden", ai_labelled: false })]);
    const [p] = [...store.proposals.values()];
    expect(p.status).toBe("vetada");
  });

  it("only the content and publishing agents get these tools", async () => {
    await once("precios", [callTool("crear_creatividad", { code: "PRD-0001", hook: "Gancho", angle: "problema", platforms: ["tiktok"], contains_ai: false })]);
    expect(store.creatives).toHaveLength(0);
    expect(store.actions[0]).toMatchObject({ outcome: "bloqueada" });
  });
});
