import { describe, expect, it } from "vitest";
import { AUTO_END, AUTO_START, isoWeek, mdTable, mergeAutoZone, parseNote, updateNote } from "@/lib/obsidian/markdown";

const NOTE = `---
tipo: producto
id: PRD-0001
estado: en-test
responsable: producto
creado: 2026-11-04
actualizado: 2026-11-04
tags: [ejemplo, producto/estado/en-test, canal/web]
---

# PRD-0001 Organizador

En una frase: nota escrita a mano.

## Aprendizajes
Lo que escribió una persona.
`;

describe("frontmatter", () => {
  it("parses scalars, numbers and inline lists", () => {
    const { front, body } = parseNote(NOTE);
    expect(front).toMatchObject({ tipo: "producto", id: "PRD-0001", tags: ["ejemplo", "producto/estado/en-test", "canal/web"] });
    expect(body.startsWith("\n# PRD-0001")).toBe(true);
  });
});

describe("automatic zone", () => {
  it("appends the zone the first time and replaces only it afterwards", () => {
    const once = mergeAutoZone("Texto manual.\n", "dato 1");
    expect(once).toContain(`${AUTO_START}\ndato 1\n${AUTO_END}`);
    const twice = mergeAutoZone(`${once}\nMás texto manual al final.\n`, "dato 2");
    expect(twice).toContain("dato 2");
    expect(twice).not.toContain("dato 1");
    expect(twice).toContain("Texto manual.");
    expect(twice).toContain("Más texto manual al final.");
  });
});

describe("updateNote", () => {
  const managed = { estado: "escalando", decision: "escalar", tags: ["producto/estado/escalando", "decision/escalar"] };

  it("keeps hand-written text and unmanaged frontmatter, replaces app tags", () => {
    const { text, changed } = updateNote(NOTE, managed, "| ROAS | 3,5 |", "2026-11-10");
    expect(changed).toBe(true);
    expect(text).toContain("Lo que escribió una persona.");
    expect(text).toContain("responsable: producto");
    expect(text).toContain("creado: 2026-11-04");
    expect(text).toContain("actualizado: 2026-11-10");
    expect(parseNote(text).front.tags).toEqual(["ejemplo", "canal/web", "producto/estado/escalando", "decision/escalar"]);
  });

  it("is idempotent: exporting twice produces no change, not even the date", () => {
    const first = updateNote(NOTE, managed, "| ROAS | 3,5 |", "2026-11-10").text;
    const second = updateNote(first, managed, "| ROAS | 3,5 |", "2026-11-11");
    expect(second.changed).toBe(false);
    expect(second.text).toBe(first);
  });

  it("creates a new note with frontmatter and the zone", () => {
    const { text, changed } = updateNote(null, { tipo: "producto", id: "PRD-0009" }, "datos", "2026-11-10", "# PRD-0009\n");
    expect(changed).toBe(true);
    expect(parseNote(text).front).toMatchObject({ id: "PRD-0009", creado: "2026-11-10", actualizado: "2026-11-10" });
  });
});

describe("helpers", () => {
  it("computes ISO weeks, including year boundaries", () => {
    expect(isoWeek("2026-11-04")).toEqual({ year: 2026, week: 45 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2026-01-01")).toEqual({ year: 2026, week: 1 });
  });

  it("escapes pipes in markdown tables", () => {
    expect(mdTable(["a"], [["x|y"]])).toBe("| a |\n|---|\n| x\\|y |");
  });
});
