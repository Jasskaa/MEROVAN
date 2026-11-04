import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/domain/csv";

describe("csv", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell('Pack "3", negro')).toBe('"Pack ""3"", negro"');
    expect(csvCell("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("-5")).toBe("'-5");
  });

  it("adds a BOM and CRLF line endings", () => {
    expect(toCsv(["a", "b"], [[1, null]])).toBe("﻿a,b\r\n1,\r\n");
  });
});
