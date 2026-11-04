import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkVault } from "@/lib/obsidian/check";

const front = (extra: string) => `---\ntipo: producto\nestado: idea\nresponsable: x\ncreado: 2026-11-04\nactualizado: 2026-11-04\n${extra}\n---\n`;

describe("vault checker", () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "02-PRODUCTOS"));
  writeFileSync(join(dir, "Home.md"), `${front("id: INI\ntags: [inicio]").replace("producto", "indice").replace("idea", "activo")}[[PRD-0001 Bueno]] [[No existe]] [[PRD-0002 Malo]]`);
  writeFileSync(join(dir, "02-PRODUCTOS", "PRD-0001 Bueno.md"), front("id: PRD-0001\ntags: [canal/web]"));
  writeFileSync(join(dir, "02-PRODUCTOS", "PRD-0002 Malo.md"), front("id: PRD-0001\ntags: [inventada]").replace("idea", "volando"));
  writeFileSync(join(dir, "02-PRODUCTOS", "Huérfana.md"), "sin frontmatter");
  const r = checkVault(dir);

  it("finds broken links, duplicate IDs, bad states, tags and missing frontmatter", () => {
    expect(r.errors).toEqual(expect.arrayContaining([
      "Home.md: enlace roto [[No existe]]",
      "02-PRODUCTOS/PRD-0002 Malo.md: el nombre del archivo debe empezar por su id «PRD-0001»",
      "02-PRODUCTOS/PRD-0002 Malo.md: id «PRD-0001» repetido (también en 02-PRODUCTOS/PRD-0001 Bueno.md)",
      "02-PRODUCTOS/PRD-0002 Malo.md: estado «volando» no permitido para «producto»",
      "02-PRODUCTOS/PRD-0002 Malo.md: etiqueta «inventada» fuera de la taxonomía (añádela en Convenciones)",
      "02-PRODUCTOS/Huérfana.md: sin frontmatter",
    ]));
    expect(r.errors).toHaveLength(6);
  });

  it("warns about orphan notes", () => {
    expect(r.warnings).toEqual(["02-PRODUCTOS/Huérfana.md: nota huérfana (nadie la enlaza)"]);
  });
});

describe("MEROVAN vault", () => {
  it("has 0 errors (acceptance criterion of phase G)", () => {
    const r = checkVault(join(__dirname, "..", "..", ".."));
    expect(r.errors).toEqual([]);
  });
});
