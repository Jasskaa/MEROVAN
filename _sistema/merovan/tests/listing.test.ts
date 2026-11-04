import { describe, expect, it } from "vitest";
import { type ListingInput, prohibitedTerms, validateListing } from "@/lib/domain/listing";

const good: ListingInput = {
  name: "Organizador de cables",
  description: "Ordena los cables de tu escritorio en segundos con adhesivo que no deja restos.",
  bullets: ["Pack de 3", "Adhesivo sin restos", "Envío desde España"],
  priceCents: 1995,
  compareAtCents: null,
  gpsrManufacturer: "Fabricante S.L.",
  gpsrAddress: "Calle 1, Madrid",
  gpsrContact: "info@example.com",
  legalRedFlag: false,
  imageCount: 3,
  videoCount: 1,
  variants: [{ sku: "ORG-3", stock: 10 }],
};

describe("validateListing", () => {
  it("accepts a complete listing with no warnings", () => {
    expect(validateListing(good)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("blocks missing GPSR, photos and stock", () => {
    const r = validateListing({ ...good, gpsrContact: "", imageCount: 0, variants: [{ sku: "A", stock: 0 }] });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      "Faltan datos GPSR (fabricante, dirección y contacto).",
      "Sube al menos una foto.",
      "Ninguna variante tiene stock.",
    ]);
  });

  it("rejects a compare-at price that is not higher than the price", () => {
    expect(validateListing({ ...good, compareAtCents: 1995 }).errors[0]).toMatch(/precio tachado/);
  });

  it("detects prohibited claims, ignoring accents and case", () => {
    expect(prohibitedTerms("Crema MILAGROSA que cura el acné, 100 % garantizado")).toEqual([
      "afirmación médica", "garantía absoluta", "promesa exagerada",
    ]);
    expect(prohibitedTerms("Funciona mejor que Dyson")).toEqual(["comparación con marca"]);
    expect(prohibitedTerms("Ordena tu escritorio")).toEqual([]);
  });

  it("warns (without blocking) about few photos and no video", () => {
    const r = validateListing({ ...good, imageCount: 1, videoCount: 0 });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(2);
  });
});
