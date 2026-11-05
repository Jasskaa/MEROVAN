// Vault quality checker: names, unique IDs, required frontmatter, closed tag/status lists,
// broken links and orphan notes. Rules mirror 00-INICIO/Convenciones.md.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseNote } from "./markdown";

const SKIP_DIRS = new Set([".obsidian", "_sistema", ".git", ".github", ".claude", ".trash", "node_modules"]);
const REQUIRED = ["tipo", "id", "estado", "responsable", "creado", "actualizado", "tags"];
const EXEMPT_FRONT = [/(^|\/)10-RECURSOS\/Plantillas\//, /(^|\/)01-ESTRATEGIA\/Roadmap\.md$/];

const ID_FORMAT: Record<string, RegExp> = {
  producto: /^PRD-\d{4}$/, proveedor: /^PRV-\d{4}$/, muestra: /^MUE-\d{4}$/, creatividad: /^CRE-\d{4}$/,
  guion: /^GUI-\d{4}$/, campana: /^CAM-\d{4}$/, sop: /^SOP-\d{4}$/, adr: /^ADR-\d{4}$/,
  reunion: /^REU-\d{4}-\d{2}-\d{2}$/, informe: /^REP-\d{4}-(S\d{2}|\d{2})$/,
};

const STATES: Record<string, string[]> = {
  producto: ["idea", "candidato", "validando-proveedor", "muestra-pedida", "muestra-aprobada", "listo-para-publicar", "en-test", "escalando", "pausado", "descartado"],
  proveedor: ["evaluando", "activo", "respaldo", "descartado"],
  muestra: ["pedida", "recibida", "aprobada", "rechazada"],
  guion: ["borrador", "revisado", "aprobado"],
  creatividad: ["idea", "guion", "grabado", "editado", "aprobado", "publicado", "retirado"],
  campana: ["borrador", "pendiente-aprobacion", "activa", "pausada", "finalizada"],
  sop: ["borrador", "activo", "obsoleto"], adr: ["borrador", "activo", "obsoleto"], guia: ["borrador", "activo", "obsoleto"],
  reunion: ["abierto", "cerrado"], informe: ["abierto", "cerrado"], indice: ["activo"],
};

const TAG_RULES = [
  /^producto\/estado\/[a-z-]+$/, /^decision\/(escalar|arreglar|matar|esperar)$/, /^canal\/(web|tiktok-shop|meta|instagram)$/,
  /^legal\/(riesgo|gpsr|ce)$/, /^marketing\/(ia|patrocinado)$/, /^(ejemplo|inicio)$/,
];

export interface VaultReport {
  notes: number;
  errors: string[];
  warnings: string[];
}

function walk(dir: string, root: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

export function checkVault(root: string): VaultReport {
  const files = walk(root, root);
  // CLAUDE.md at the root is the Claude Code guide, not a vault note.
  const notes = files.filter((f) => f.endsWith(".md") && f !== "CLAUDE.md");
  const targets = new Set<string>();
  for (const f of files) {
    const noExt = f.replace(/\.[^/.]+$/, "");
    targets.add(f).add(noExt).add(noExt.split("/").pop()!).add(f.split("/").pop()!);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Map<string, string>();
  const linkedTo = new Set<string>();

  for (const f of notes) {
    const text = readFileSync(join(root, f), "utf8");
    const body = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    for (const m of body.matchAll(/!?\[\[([^\]|#]+)/g)) {
      const target = m[1].trim().replace(/\\$/, "");
      if (!targets.has(target)) errors.push(`${f}: enlace roto [[${target}]]`);
      else linkedTo.add(target.split("/").pop()!.replace(/\.md$/, ""));
    }

    if (EXEMPT_FRONT.some((r) => r.test(f)) || text.startsWith("---\n\nkanban-plugin")) continue;
    const { front, hasFront } = parseNote(text);
    if (!hasFront) { errors.push(`${f}: sin frontmatter`); continue; }
    for (const k of REQUIRED) if (!(k in front)) errors.push(`${f}: falta «${k}» en el frontmatter`);

    const tipo = String(front.tipo ?? "");
    const id = String(front.id ?? "");
    const fileName = f.split("/").pop()!.replace(/\.md$/, "");
    if (ID_FORMAT[tipo] && !ID_FORMAT[tipo].test(id)) errors.push(`${f}: id «${id}» no sigue el formato de «${tipo}»`);
    if (ID_FORMAT[tipo] && !fileName.startsWith(id)) errors.push(`${f}: el nombre del archivo debe empezar por su id «${id}»`);
    if (id) {
      if (ids.has(id)) errors.push(`${f}: id «${id}» repetido (también en ${ids.get(id)})`);
      else ids.set(id, f);
    }
    if (STATES[tipo] && front.estado != null && !STATES[tipo].includes(String(front.estado))) {
      errors.push(`${f}: estado «${front.estado}» no permitido para «${tipo}»`);
    }
    for (const tag of Array.isArray(front.tags) ? front.tags : []) {
      if (!TAG_RULES.some((r) => r.test(tag))) errors.push(`${f}: etiqueta «${tag}» fuera de la taxonomía (añádela en Convenciones)`);
    }
    if (/[?:\\|*"<>]/.test(fileName)) errors.push(`${f}: el nombre contiene caracteres no permitidos`);
  }

  for (const f of notes) {
    const name = f.split("/").pop()!.replace(/\.md$/, "");
    const isEntry = name === "Home" || name === "_Índice" || f.startsWith("09-EQUIPO/Diario/") || EXEMPT_FRONT.some((r) => r.test(f));
    if (!isEntry && !linkedTo.has(name)) warnings.push(`${f}: nota huérfana (nadie la enlaza)`);
  }
  return { notes: notes.length, errors, warnings };
}

export function reportMarkdown(r: VaultReport, when: string) {
  return [
    `# Informe de calidad de la bóveda`, "",
    `Revisado: ${when} · ${r.notes} notas · **${r.errors.length} errores** · ${r.warnings.length} avisos`, "",
    "## Errores", ...(r.errors.length ? r.errors.map((e) => `- ${e}`) : ["- Ninguno"]), "",
    "## Avisos", ...(r.warnings.length ? r.warnings.map((w) => `- ${w}`) : ["- Ninguno"]), "",
  ].join("\n");
}
