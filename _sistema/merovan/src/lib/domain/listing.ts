// Listing validator: what a product needs before it can be published in the store or TikTok Shop.
// Pure module. Errors block publication; warnings are shown but do not block.

export interface ListingInput {
  name: string;
  description: string;
  bullets: string[];
  priceCents: number | null;
  compareAtCents: number | null;
  gpsrManufacturer: string | null;
  gpsrAddress: string | null;
  gpsrContact: string | null;
  legalRedFlag: boolean;
  imageCount: number;
  videoCount: number;
  variants: { sku: string; stock: number }[];
}

// Claims that platforms and EU consumer law treat as misleading or medical. Lower-case, accent-free.
const PROHIBITED: { pattern: RegExp; why: string }[] = [
  { pattern: /\b(cura|curar|sana|sanar|trata|tratamiento)\b/, why: "afirmación médica" },
  { pattern: /\b(adelgaza|quema grasa|pierde peso)\b/, why: "afirmación de salud" },
  { pattern: /100\s*%\s*garantizad/, why: "garantía absoluta" },
  { pattern: /\bmilagro(s[oa]s?)?\b/, why: "promesa exagerada" },
  { pattern: /\b(mejor que|igual que|como el de)\s+(apple|samsung|dyson|nike|xiaomi|ikea)\b/, why: "comparación con marca" },
  { pattern: /\b(replica|imitacion|tipo (apple|dyson|nike))\b/, why: "posible copia de marca" },
];

const normalise = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function prohibitedTerms(text: string): string[] {
  const t = normalise(text);
  return PROHIBITED.filter((p) => p.pattern.test(t)).map((p) => p.why);
}

export function validateListing(p: ListingInput) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (p.name.trim().length < 3) errors.push("El nombre es demasiado corto.");
  if (p.description.trim().length < 40) errors.push("La descripción debe tener al menos 40 caracteres.");
  if (p.priceCents == null || p.priceCents <= 0) errors.push("Falta el precio de venta.");
  if (p.compareAtCents != null && p.priceCents != null && p.compareAtCents <= p.priceCents) {
    errors.push("El precio tachado debe ser mayor que el precio de venta (o déjalo vacío).");
  }
  if (!p.gpsrManufacturer?.trim() || !p.gpsrAddress?.trim() || !p.gpsrContact?.trim()) {
    errors.push("Faltan datos GPSR (fabricante, dirección y contacto).");
  }
  if (p.legalRedFlag) errors.push("Hay una bandera roja en el checklist legal.");
  if (p.imageCount < 1) errors.push("Sube al menos una foto.");
  if (p.variants.length < 1) errors.push("Crea al menos una variante con su SKU.");
  else if (p.variants.every((v) => v.stock <= 0)) errors.push("Ninguna variante tiene stock.");

  const found = [...new Set(prohibitedTerms([p.name, p.description, ...p.bullets].join(" ")))];
  if (found.length) errors.push(`Términos no permitidos: ${found.join(", ")}.`);

  if (p.imageCount < 3) warnings.push("Recomendado: 3 o más fotos.");
  if (p.videoCount < 1) warnings.push("Recomendado: un vídeo propio (convierte mejor).");
  if (p.bullets.length < 3) warnings.push("Recomendado: 3 puntos clave.");

  return { ok: errors.length === 0, errors, warnings };
}
