// MEROVAN tool server (MCP over stdio): lets Claude Code work on the portal directly, without
// commits or SQL. Same rules as the panel: drafts only, publication goes to the approval inbox,
// every change is audited as "claude-mcp". Started by the repository's .mcp.json.
//
//   node --conditions=react-server --import tsx _sistema/merovan/mcp/server.mts
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const APP = resolve(import.meta.dirname, "..");
const envFile = resolve(APP, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.VAULT_PATH ??= resolve(APP, "..", "..");

const { computeMargin } = await import("@/lib/domain/margin");
const { validateListing } = await import("@/lib/domain/listing");
const { scorePasses, CRITERIA, STATUSES } = await import("@/lib/domain/product");
const { loadSettings, marginDefaults } = await import("@/lib/settings");
const { SupabaseStore } = await import("@/lib/agents/supabase-store");
const { propose } = await import("@/lib/agents/pipeline");
const { exportToVault, vaultRoot } = await import("@/lib/obsidian/export");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = URL_ && KEY ? createClient(URL_, KEY, { auth: { persistSession: false } }) : null;

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true });
const cents = (eur: number) => Math.round(eur * 100);
const eur = (c: number | null | undefined) => (c == null ? null : `${(c / 100).toFixed(2).replace(".", ",")} €`);
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const CODE = z.string().regex(/^PRD-\d{4}$/, "Código PRD-0001");

function need() {
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en _sistema/merovan/.env.local (Supabase → Project Settings → API Keys → Secret). Jaska la pega; nunca en el chat.");
  return db;
}
async function audit(action: string, entity: string, id: string | null, details: object = {}) {
  await need().from("audit_log").insert({ actor: null, action, entity, entity_id: id, details: { ...details, via: "claude-mcp" } });
}
async function product(code: string) {
  const { data, error } = await need().from("products")
    .select("*, product_variants(id, sku, title, price_cents, stock), product_media(id, storage_path, kind, alt, position), supplier_offers(role, unit_cost_cents, shipping_cents, promised_days, suppliers(code, name, warehouse_country, platform))")
    .eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No existe ${code}`);
  return data;
}
async function editable(code: string) {
  const p = await product(code);
  if (p.publish_status === "publicado") throw new Error(`${code} está publicado: los cambios públicos van por la Bandeja de aprobaciones del panel`);
  return p;
}
async function summary(code: string) {
  const p = await product(code);
  const defaults = marginDefaults(await loadSettings(need()));
  const main = p.supplier_offers.find((o: { role: string }) => o.role === "principal");
  const margin = p.price_cents && main
    ? computeMargin({ ...defaults, priceWithVat: p.price_cents / 100, vatRate: Number(p.vat_rate), productCost: main.unit_cost_cents / 100, shippingCost: main.shipping_cents / 100 })
    : null;
  const listing = validateListing({
    name: p.name, description: p.description, bullets: p.bullets, priceCents: p.price_cents, compareAtCents: p.compare_at_cents,
    gpsrManufacturer: p.gpsr_manufacturer, gpsrAddress: p.gpsr_address, gpsrContact: p.gpsr_contact, legalRedFlag: p.legal_red_flag,
    imageCount: p.product_media.filter((m: { kind: string }) => m.kind === "image").length,
    videoCount: p.product_media.filter((m: { kind: string }) => m.kind === "video").length,
    variants: p.product_variants,
  });
  return {
    codigo: p.code, nombre: p.name, nicho: p.niche, estado: p.status, publicacion: p.publish_status, precio: eur(p.price_cents),
    descripcion: p.description, puntos: p.bullets, puntuacion: scorePasses(p.score_detail ?? {}),
    gpsr: { fabricante: p.gpsr_manufacturer, direccion: p.gpsr_address, contacto: p.gpsr_contact, advertencias: p.gpsr_warnings },
    variantes: p.product_variants, medios: p.product_media.length,
    ofertas: p.supplier_offers.map((o: { role: string; unit_cost_cents: number; shipping_cents: number; promised_days: number | null; suppliers: { code: string; name: string } }) =>
      ({ rol: o.role, proveedor: `${o.suppliers.code} ${o.suppliers.name}`, coste: eur(o.unit_cost_cents), envio: eur(o.shipping_cents), dias: o.promised_days })),
    margen: margin && { contribucion: `${margin.contributionMargin.toFixed(2)} €`, porcentaje: `${(margin.marginPct * 100).toFixed(1)} %`, roas_equilibrio: margin.breakEvenRoas, avisos: margin.warnings },
    validacion_publicar: listing,
    panel: `/admin/productos/${p.code}`,
  };
}

const server = new McpServer({ name: "merovan", version: "1.0.0" }, {
  instructions:
    "Herramientas del portal de MEROVAN (tienda propia + panel). Todo se crea como borrador; publicar o cambiar algo público " +
    "se propone y Jaska lo aprueba en la Bandeja. Importes en euros. No subas imágenes de otras tiendas: solo fotos propias o del proveedor con permiso.",
});

server.registerTool("estado_portal", {
  description: "Resumen del portal: productos por estado, pedidos, propuestas pendientes, parada global, simulación y qué claves faltan.",
}, async () => {
  try {
    const d = need();
    const [{ data: products }, { count: orders }, { count: pending }, { data: state }] = await Promise.all([
      d.from("products").select("code, name, status, publish_status").order("code"),
      d.from("orders").select("*", { count: "exact", head: true }).neq("status", "pendiente_pago"),
      d.from("agent_proposals").select("*", { count: "exact", head: true }).eq("status", "pendiente"),
      d.from("system_state").select("kill_switch, dry_run").single(),
    ]);
    return ok({
      productos: products, pedidos_cobrados: orders, propuestas_pendientes: pending, parada_global: state?.kill_switch, simulacion: state?.dry_run,
      claves: { ia: Boolean(process.env.MEROVAN_ANTHROPIC_API_KEY), stripe: Boolean(process.env.STRIPE_SECRET_KEY), servicio: true },
      boveda: vaultRoot() ? "accesible" : "no encontrada",
    });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("listar_productos", {
  description: "Lista los productos con estado, publicación, precio y puntuación.",
  inputSchema: { estado: z.string().optional().describe("Filtra por estado: idea, candidato, en_test, descartado…") },
}, async ({ estado }) => {
  try {
    let q = need().from("products").select("code, name, niche, status, publish_status, price_cents, score").order("code");
    if (estado) q = q.eq("status", estado);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ok((data ?? []).map((p) => ({ ...p, price_cents: undefined, precio: eur(p.price_cents) })));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("ver_producto", {
  description: "Ficha completa de un producto: textos, GPSR, variantes, ofertas de proveedor, margen calculado y qué le falta para publicarse.",
  inputSchema: { code: CODE },
}, async ({ code }) => { try { return ok(await summary(code)); } catch (e) { return fail((e as Error).message); } });

server.registerTool("crear_producto", {
  description: "Crea un producto nuevo como borrador (estado idea, no publicado). Devuelve su código PRD.",
  inputSchema: {
    nombre: z.string().min(3).max(120), nicho: z.string().max(80).optional(), descripcion: z.string().max(3000).optional(),
    puntos: z.array(z.string().min(3).max(200)).max(6).optional(), precio_eur: z.number().positive().max(10000).optional(),
    peso_g: z.number().int().positive().optional(), pais_origen: z.string().length(2).optional(),
  },
}, async (i) => {
  try {
    const d = need();
    const { data: code } = await d.rpc("next_code", { prefix: "PRD" });
    const { error } = await d.from("products").insert({
      code, name: i.nombre, slug: `${slugify(i.nombre)}-${String(code).slice(4)}`, niche: i.nicho ?? null, status: "idea", publish_status: "borrador",
      description: i.descripcion ?? "", bullets: i.puntos ?? [], price_cents: i.precio_eur != null ? cents(i.precio_eur) : null,
      weight_g: i.peso_g ?? null, origin_country: i.pais_origen?.toUpperCase() ?? null,
    });
    if (error) throw new Error(error.message);
    await audit("crear_producto", "products", code, { nombre: i.nombre });
    return ok(await summary(code));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("editar_producto", {
  description: "Edita un producto que NO esté publicado: nombre, nicho, textos, precio, precio tachado (solo si es un precio anterior real), peso, origen, IVA.",
  inputSchema: {
    code: CODE, nombre: z.string().min(3).max(120).optional(), nicho: z.string().max(80).optional(), descripcion: z.string().max(3000).optional(),
    puntos: z.array(z.string().min(3).max(200)).max(6).optional(), precio_eur: z.number().positive().max(10000).optional(),
    precio_tachado_eur: z.number().positive().max(10000).nullable().optional(), peso_g: z.number().int().positive().optional(),
    pais_origen: z.string().length(2).optional(), iva: z.number().min(0).max(0.3).optional(),
  },
}, async (i) => {
  try {
    await editable(i.code);
    const patch: Record<string, unknown> = {};
    if (i.nombre) patch.name = i.nombre;
    if (i.nicho !== undefined) patch.niche = i.nicho;
    if (i.descripcion !== undefined) patch.description = i.descripcion;
    if (i.puntos) patch.bullets = i.puntos;
    if (i.precio_eur !== undefined) patch.price_cents = cents(i.precio_eur);
    if (i.precio_tachado_eur !== undefined) patch.compare_at_cents = i.precio_tachado_eur == null ? null : cents(i.precio_tachado_eur);
    if (i.peso_g) patch.weight_g = i.peso_g;
    if (i.pais_origen) patch.origin_country = i.pais_origen.toUpperCase();
    if (i.iva !== undefined) patch.vat_rate = i.iva;
    if (!Object.keys(patch).length) throw new Error("No hay cambios");
    const { error } = await need().from("products").update(patch).eq("code", i.code);
    if (error) throw new Error(error.message);
    await audit("editar_producto", "products", i.code, { campos: Object.keys(patch) });
    return ok(await summary(i.code));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("puntuar_producto", {
  description: `Guarda la puntuación 0-5 por criterio (${CRITERIA.map((c) => c.key).join(", ")}). El total /40 lo calcula el sistema.`,
  inputSchema: { code: CODE, notas: z.object(Object.fromEntries(CRITERIA.map((c) => [c.key, z.number().int().min(0).max(5).describe(c.hint)]))) },
}, async ({ code, notas }) => {
  try {
    await product(code);
    const r = scorePasses(notas as Record<string, number>);
    const { error } = await need().from("products").update({ score_detail: notas, score: Math.round(r.total) }).eq("code", code);
    if (error) throw new Error(error.message);
    await audit("puntuar_producto", "products", code, notas);
    return ok(r);
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("datos_gpsr", {
  description: "Guarda los datos de seguridad del producto (GPSR) que exige la UE para publicar: fabricante o responsable en la UE, dirección, contacto y advertencias. Solo datos reales del proveedor.",
  inputSchema: { code: CODE, fabricante: z.string().min(2).max(200), direccion: z.string().min(5).max(300), contacto: z.string().min(3).max(200), advertencias: z.string().max(1000).optional() },
}, async (i) => {
  try {
    await editable(i.code);
    const { error } = await need().from("products").update({ gpsr_manufacturer: i.fabricante, gpsr_address: i.direccion, gpsr_contact: i.contacto, gpsr_warnings: i.advertencias ?? null }).eq("code", i.code);
    if (error) throw new Error(error.message);
    await audit("datos_gpsr", "products", i.code);
    return ok(await summary(i.code));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("guardar_variante", {
  description: "Crea o actualiza una variante (SKU) de un producto con su stock y, si difiere, su precio.",
  inputSchema: { code: CODE, sku: z.string().min(3).max(60), titulo: z.string().min(1).max(80), stock: z.number().int().min(0), precio_eur: z.number().positive().optional() },
}, async (i) => {
  try {
    const p = await product(i.code);
    const { error } = await need().from("product_variants").upsert(
      { product_id: p.id, sku: i.sku, title: i.titulo, stock: i.stock, price_cents: i.precio_eur != null ? cents(i.precio_eur) : null }, { onConflict: "sku" });
    if (error) throw new Error(error.message);
    await audit("guardar_variante", "products", i.code, { sku: i.sku });
    return ok(await summary(i.code));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("guardar_proveedor", {
  description: "Crea o actualiza un proveedor (por nombre). Devuelve su código PRV.",
  inputSchema: {
    nombre: z.string().min(2).max(120), pais_almacen: z.string().length(2).optional(), plataforma: z.string().max(60).optional(),
    url: z.string().url().optional(), direccion_devoluciones_ue: z.string().max(300).optional(), fiabilidad: z.number().min(0).max(1).optional(), notas: z.string().max(2000).optional(),
  },
}, async (i) => {
  try {
    const d = need();
    const fields = { warehouse_country: i.pais_almacen?.toUpperCase(), platform: i.plataforma, url: i.url, eu_return_address: i.direccion_devoluciones_ue, reliability: i.fiabilidad, notes: i.notas };
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const { data: found } = await d.from("suppliers").select("code").eq("name", i.nombre).maybeSingle();
    let code = found?.code as string | undefined;
    if (code) {
      const { error } = await d.from("suppliers").update(clean).eq("code", code);
      if (error) throw new Error(error.message);
    } else {
      code = (await d.rpc("next_code", { prefix: "PRV" })).data as string;
      const { error } = await d.from("suppliers").insert({ code, name: i.nombre, ...clean });
      if (error) throw new Error(error.message);
    }
    await audit("guardar_proveedor", "suppliers", code, { nombre: i.nombre });
    return ok({ codigo: code, nombre: i.nombre, ...clean });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("guardar_oferta", {
  description: "Guarda lo que cuesta un producto en un proveedor (sin IVA): coste unitario, envío a España y plazo. Rol principal, respaldo o candidato (solo un principal).",
  inputSchema: {
    code: CODE, proveedor: z.string().regex(/^PRV-\d{4}$/), rol: z.enum(["principal", "respaldo", "candidato"]),
    coste_eur: z.number().min(0), envio_eur: z.number().min(0), dias: z.number().int().positive().optional(),
  },
}, async (i) => {
  try {
    const d = need();
    const p = await product(i.code);
    const { data: sup } = await d.from("suppliers").select("id").eq("code", i.proveedor).maybeSingle();
    if (!sup) throw new Error(`No existe ${i.proveedor}`);
    if (i.rol === "principal") await d.from("supplier_offers").update({ role: "candidato" }).eq("product_id", p.id).eq("role", "principal");
    const { error } = await d.from("supplier_offers").upsert({
      product_id: p.id, supplier_id: sup.id, role: i.rol, unit_cost_cents: cents(i.coste_eur), shipping_cents: cents(i.envio_eur),
      promised_days: i.dias ?? null, reviewed_at: new Date().toISOString().slice(0, 10),
    }, { onConflict: "product_id,supplier_id" });
    if (error) throw new Error(error.message);
    await audit("guardar_oferta", "products", i.code, { proveedor: i.proveedor, rol: i.rol });
    return ok(await summary(i.code));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("calcular_margen", {
  description: "Calcula margen de contribución, % y ROAS de equilibrio para un precio y un coste (euros, coste sin IVA), con IVA, pasarela y devoluciones de Ajustes.",
  inputSchema: { precio_eur: z.number().positive(), coste_eur: z.number().min(0), envio_eur: z.number().min(0).default(0) },
}, async (i) => {
  try {
    const m = computeMargin({ ...marginDefaults(await loadSettings(need())), priceWithVat: i.precio_eur, productCost: i.coste_eur, shippingCost: i.envio_eur });
    return ok({ ...m, margen_pct: `${(m.marginPct * 100).toFixed(1)} %` });
  } catch (e) { return fail((e as Error).message); }
});

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };
server.registerTool("subir_imagen", {
  description: "Sube una foto o vídeo desde un archivo local a la ficha. Solo material propio o del proveedor con permiso de uso: nunca imágenes de otras tiendas.",
  inputSchema: { code: CODE, ruta: z.string().describe("Ruta del archivo en este ordenador"), texto_alternativo: z.string().max(200).default("") },
}, async (i) => {
  try {
    const file = resolve(i.ruta);
    const type = MIME[extname(file).toLowerCase()];
    if (!type) throw new Error("Formato no admitido (jpg, png, webp, avif, mp4, webm, mov)");
    if (!existsSync(file)) throw new Error(`No existe ${file}`);
    const p = await product(i.code);
    const path = `${p.code}/${Date.now()}-${slugify(basename(file, extname(file)))}${extname(file).toLowerCase()}`;
    const d = need();
    const { error: upErr } = await d.storage.from("product-media").upload(path, readFileSync(file), { contentType: type });
    if (upErr) throw new Error(upErr.message);
    const { error } = await d.from("product_media").insert({ product_id: p.id, storage_path: path, kind: type.startsWith("video") ? "video" : "image", alt: i.texto_alternativo, position: p.product_media.length });
    if (error) throw new Error(error.message);
    await audit("subir_imagen", "products", i.code, { path });
    return ok(await summary(i.code));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("cambiar_estado", {
  description: `Cambia el estado del producto en el embudo (${STATUSES.map((s) => s.key).join(", ")}) con un motivo. La base de datos bloquea saltos sin requisitos (muestra, respaldo, GPSR…).`,
  inputSchema: { code: CODE, estado: z.enum(STATUSES.map((s) => s.key) as [string, ...string[]]), motivo: z.string().min(3).max(500) },
}, async (i) => {
  try {
    const p = await product(i.code);
    const d = need();
    const { error } = await d.from("products").update({ status: i.estado }).eq("id", p.id);
    if (error) throw new Error(error.message);
    await d.from("status_history").insert({ product_id: p.id, from_status: p.status, to_status: i.estado, reason: `${i.motivo} (Claude)` });
    await audit("cambio_estado", "products", i.code, { de: p.status, a: i.estado, motivo: i.motivo });
    return ok(await summary(i.code));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("borrar_borrador", {
  description: "Borra un producto que nunca se ha publicado ni tiene pedidos (con sus variantes, ofertas e imágenes). Pide confirmación a Jaska antes de usarla.",
  inputSchema: { code: CODE, confirmado_por_jaska: z.literal(true) },
}, async ({ code }) => {
  try {
    const p = await product(code);
    if (p.publish_status !== "borrador") throw new Error(`${code} está «${p.publish_status}»: no se borra, se descarta`);
    const d = need();
    const { count } = await d.from("order_items").select("*", { count: "exact", head: true }).eq("product_id", p.id);
    if (count) throw new Error(`${code} tiene pedidos: no se borra, se descarta`);
    const paths = p.product_media.map((m: { storage_path: string }) => m.storage_path);
    if (paths.length) await d.storage.from("product-media").remove(paths);
    const { error } = await d.from("products").delete().eq("id", p.id);
    if (error) throw new Error(error.message);
    await audit("borrar_borrador", "products", code, { nombre: p.name });
    return ok(`${code} borrado. Ejecuta exportar_obsidian para actualizar la bóveda (su nota se queda como histórico hasta que la borres).`);
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("proponer_publicacion", {
  description: "Propone publicar un producto en la tienda. Comprueba la ficha y el margen; la propuesta va a la Bandeja de aprobaciones y solo Jaska la aprueba.",
  inputSchema: { code: CODE, motivo: z.string().min(10).max(1000) },
}, async ({ code, motivo }) => {
  try {
    const s = await summary(code);
    if (!s.validacion_publicar.ok) throw new Error(`La ficha no está lista: ${s.validacion_publicar.errors.join(" ")}`);
    const marginPct = s.margen ? Number.parseFloat(s.margen.porcentaje) : undefined;
    const store = new SupabaseStore(need(), null);
    const r = await propose(store, {
      agent: "fichas", runId: null, taskId: null, actionType: "publicar_producto", title: `Publicar ${code} ${s.nombre}`, reason: `${motivo} (propuesto por Claude)`,
      payload: { code, margin_pct: marginPct, text: [s.descripcion, ...s.puntos].join("\n") }, idempotencyKey: `publicar:${code}:${new Date().toISOString().slice(0, 10)}`,
    });
    await audit("proponer_publicacion", "products", code, r);
    return ok({ ...r, siguiente_paso: "Jaska la aprueba en Panel → Agentes → Bandeja" });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("exportar_obsidian", {
  description: "Actualiza la bóveda de Obsidian con los datos del portal (notas de producto, índices, cuadro de mando, informes).",
}, async () => {
  try {
    if (!vaultRoot()) throw new Error("No se encuentra la bóveda");
    const r = await exportToVault(need());
    return ok({ creadas: r.created, actualizadas: r.updated, movidas: r.moved, sin_cambios: r.unchanged, errores_boveda: r.vaultErrors });
  } catch (e) { return fail((e as Error).message); }
});

await server.connect(new StdioServerTransport());
