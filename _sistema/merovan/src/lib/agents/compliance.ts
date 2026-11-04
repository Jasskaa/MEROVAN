// Deterministic compliance rules (the veto that does not depend on the model).
// The compliance agent adds a model review on top, but these rules alone can veto.
import { prohibitedTerms } from "@/lib/domain/listing";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const RULES: { pattern: RegExp; why: string }[] = [
  // Invented social proof
  { pattern: /(★|⭐){3,}|\b[45][.,]\d\s*\/\s*5\b|\b\d[\d.]*\+?\s*(clientes|compradores|personas)\s+(satisfech|feli|contentos)/, why: "prueba social sin verificar (valoraciones o clientes satisfechos)" },
  { pattern: /\b(miles|cientos) de (clientes|personas|compradores)\b/, why: "cifras de clientes sin verificar" },
  { pattern: /\b(testimonio|resena|opinion) de (un|una) (cliente|clienta)\b|"[^"]{10,}"\s*[-—–]\s*[a-z]+\s*[a-z]\./, why: "testimonio que no consta como real" },
  // False scarcity / urgency
  { pattern: /\b(ultimas|pocas) unidades\b|\bsolo quedan \d+\b|\bstock limitado\b/, why: "escasez no verificada" },
  { pattern: /\b(solo|unicamente) (hoy|por hoy)\b|\btermina en \d+\s*(h|horas|min)\b|\bcuenta atras\b/, why: "urgencia o cuenta atrás no verificada" },
  // Brands and rights
  { pattern: /\b(original|oficial) de (apple|samsung|nike|adidas|dyson|disney|marvel|pokemon)\b|\b(disney|marvel|pokemon|nintendo|barbie)\b/, why: "marca o personaje con derechos de terceros" },
];

export interface ComplianceInput {
  text: string;                       // everything that would be published or sent
  containsAi?: boolean;
  aiLabelled?: boolean;
  claimsVerified?: boolean;           // the agent marked numbers/claims as backed by real data
  listingErrors?: string[];           // from validateListing, for product publication
}

export function deterministicReview(i: ComplianceInput): string[] {
  const t = norm(i.text);
  const issues = prohibitedTerms(i.text).map((x) => `Término no permitido: ${x}`);
  for (const r of RULES) {
    if (r.pattern.test(t) && !(i.claimsVerified && r.why.includes("sin verificar"))) issues.push(`Riesgo: ${r.why}`);
  }
  if (i.containsAi && !i.aiLabelled) issues.push("Contenido generado con IA sin etiqueta de IA");
  for (const e of i.listingErrors ?? []) issues.push(`Ficha incompleta: ${e}`);
  return [...new Set(issues)];
}

/** Text an agent proposes to publish or send, gathered from a payload. */
export function publishableText(payload: Record<string, unknown>): string {
  const keys = ["title", "titulo", "name", "nombre", "description", "descripcion", "copy", "texto", "guion", "hook", "gancho", "mensaje", "message", "bullets", "faq", "caption"];
  const parts: string[] = [];
  const visit = (v: unknown, k?: string) => {
    if (typeof v === "string" && (!k || keys.includes(k))) parts.push(v);
    else if (Array.isArray(v)) v.forEach((x) => visit(x, k));
    else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) visit(vv, kk);
  };
  visit(payload);
  return parts.join("\n");
}
