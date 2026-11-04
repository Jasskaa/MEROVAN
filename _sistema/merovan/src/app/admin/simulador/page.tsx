import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { loadSettings, marginDefaults, requireRole } from "@/lib/admin";
import type { MarginInput } from "@/lib/domain/margin";
import { createClient } from "@/lib/supabase/server";
import { type Scenario, Simulator } from "./simulator";

export const metadata = { title: "Simulador de margen" };

const ROLES = ["owner", "producto", "finanzas"] as const;

async function saveScenario(formData: FormData) {
  "use server";
  const staff = await requireRole(...ROLES);
  const supabase = await createClient();
  const code = String(formData.get("product") ?? "");
  const { data: product } = code
    ? await supabase.from("products").select("id").eq("code", code).single()
    : { data: null };
  const { error } = await supabase.from("margin_scenarios").insert({
    product_id: product?.id ?? null,
    name: String(formData.get("name")).trim(),
    kind: String(formData.get("kind")),
    inputs: JSON.parse(String(formData.get("inputs"))),
    created_by: staff.id,
  });
  const back = `/admin/simulador${code ? `?producto=${code}&` : "?"}`;
  if (error) redirect(back + "error=" + encodeURIComponent(error.message));
  revalidatePath("/admin/simulador");
  redirect(back + "ok=1");
}

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string; ok?: string; error?: string }>;
}) {
  await requireRole(...ROLES);
  const { producto, ok, error } = await searchParams;
  const supabase = await createClient();
  const defaults = marginDefaults(await loadSettings());

  // Pre-fill from a product: its price and its main supplier offer.
  let initial: MarginInput = { ...defaults, priceWithVat: 19.95, productCost: 5, shippingCost: 3 };
  let productId: string | null = null;
  let productName: string | null = null;
  if (producto) {
    const { data: p } = await supabase
      .from("products")
      .select("id, name, price_cents, vat_rate, supplier_offers(role, unit_cost_cents, shipping_cents)")
      .eq("code", producto)
      .single();
    if (p) {
      productId = p.id;
      productName = p.name;
      const main = p.supplier_offers?.find((o) => o.role === "principal") ?? p.supplier_offers?.[0];
      initial = {
        ...initial,
        vatRate: Number(p.vat_rate),
        priceWithVat: p.price_cents != null ? p.price_cents / 100 : initial.priceWithVat,
        productCost: main ? main.unit_cost_cents / 100 : initial.productCost,
        shippingCost: main ? main.shipping_cents / 100 : initial.shippingCost,
      };
    }
  }

  let query = supabase.from("margin_scenarios").select("id, name, kind, inputs").order("created_at", { ascending: false }).limit(20);
  query = productId ? query.eq("product_id", productId) : query.is("product_id", null);
  const { data: scenarios } = await query;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Simulador de margen</h1>
        <p className="text-sm text-muted">{productName ? `${producto} · ${productName}` : "Escenario libre"} · todos los importes sin IVA salvo el precio</p>
      </header>
      {ok && <Notice tone="ok">Escenario guardado</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <Simulator initial={initial} scenarios={(scenarios ?? []) as Scenario[]} productCode={producto ?? null} save={saveScenario} canSave />
    </div>
  );
}
