import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAPPINGS, mapRows, parseCsv, parseDate, parseNumber } from "@/lib/domain/csv-import";
import { computeMetrics, groupMetrics } from "@/lib/domain/metrics";

const sample = readFileSync(join(__dirname, "..", "docs", "ejemplos", "tiktok-ads-ejemplo.csv"), "utf8");

describe("CSV parsing", () => {
  it("parses Spanish and English number formats", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("12,50")).toBe(12.5);
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("€30.00")).toBe(30);
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("abc")).toBeNaN();
  });

  it("parses ISO and Spanish dates", () => {
    expect(parseDate("2026-11-03")).toBe("2026-11-03");
    expect(parseDate("3/11/2026")).toBe("2026-11-03");
    expect(parseDate("noviembre")).toBeNull();
  });

  it("handles quotes, semicolons and the BOM", () => {
    expect(parseCsv('﻿a;b\r\n"x;y";"di ""hola"""\r\n')).toEqual([["a", "b"], ["x;y", 'di "hola"']]);
  });
});

describe("TikTok Ads sample import (docs/ejemplos)", () => {
  const { rows, errors } = mapRows(parseCsv(sample), DEFAULT_MAPPINGS.tiktok);

  it("imports 4 rows, skips the total line and links product + creative codes", () => {
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ product_code: "PRD-0001", creative_code: "CRE-0001", spend_cents: 3000, revenue_cents: 5985 });
  });

  it("matches the manual calculation for the product", () => {
    // Spend 117,00 € · revenue 159,60 € · 8 purchases · 445 clicks · 39.000 impressions
    const m = computeMetrics(rows);
    expect(m.spend_cents).toBe(11700);
    expect(m.roas).toBe(1.36);          // 159,60 / 117,00
    expect(m.cpa_cents).toBe(1462.5);   // 117,00 / 8 = 14,625 €
    expect(m.ctr).toBe(0.0114);         // 445 / 39.000 = 1,14 %
    expect(m.cpc_cents).toBe(26.29);    // 117,00 / 445 = 0,2629 €
  });

  it("converts VAT-inclusive revenue before computing ROAS", () => {
    // 159,60 / 1,21 = 131,90 ; / 117,00 = 1,127
    expect(computeMetrics(rows, { revenueIncludesVat: true, vatRate: 0.21 }).roas).toBe(1.13);
  });

  it("ranks creatives and matches manual numbers per creative", () => {
    const [best, second] = groupMetrics(rows, (r) => r.creative_code);
    // CRE-0001: spend 66 €, revenue 139,65 €, 7 purchases, 360 clicks / 22.000 impressions
    expect(best).toMatchObject({ key: "CRE-0001", spend_cents: 6600, purchases: 7, roas: 2.12, cpa_cents: 942.86, ctr: 0.0164 });
    // CRE-0002: spend 51 €, revenue 19,95 €, 1 purchase, 85 clicks / 17.000 impressions
    expect(second).toMatchObject({ key: "CRE-0002", spend_cents: 5100, purchases: 1, roas: 0.39, cpa_cents: 5100, ctr: 0.005 });
  });

  it("reports missing required columns and invalid rows", () => {
    expect(mapRows([["Fecha"]], DEFAULT_MAPPINGS.tiktok).errors[0]).toMatch(/Columnas obligatorias/);
    const bad = mapRows(parseCsv("Date,Campaign name,Impressions,Clicks (destination),Cost\nayer,X,10,20,abc\n"), DEFAULT_MAPPINGS.tiktok);
    expect(bad.errors[0]).toMatch(/Línea 2: fecha "ayer" no válida; números no válidos en spend; más clics que impresiones/);
  });

  it("returns null ratios instead of dividing by zero", () => {
    expect(computeMetrics([]).roas).toBeNull();
  });
});
