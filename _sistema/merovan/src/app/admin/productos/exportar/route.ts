import { NextResponse } from "next/server";
import { audit } from "@/lib/admin";
import { toCsv } from "@/lib/domain/csv";
import { mediaUrl } from "@/lib/store";
import { createClient, getStaff } from "@/lib/supabase/server";

// Manual channel sync while there is no TikTok Shop API connection:
// one row per variant of every published product. Map these columns to the official
// bulk-upload template from Seller Center (it changes over time, so it is not hard-coded here).
export async function GET() {
  const staff = await getStaff();
  if (!staff || !["owner", "producto", "marketing"].includes(staff.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("code, name, description, bullets, price_cents, weight_g, gpsr_manufacturer, gpsr_address, gpsr_contact, gpsr_warnings, product_variants(sku, title, price_cents, stock), product_media(storage_path, kind, position)")
    .eq("publish_status", "publicado")
    .order("code");

  const rows = (products ?? []).flatMap((p) => {
    const images = (p.product_media ?? [])
      .filter((m) => m.kind === "image")
      .sort((a, b) => a.position - b.position)
      .map((m) => mediaUrl(m.storage_path));
    return (p.product_variants ?? []).map((v) => [
      p.code, v.sku, p.name, v.title, [p.description, ...(p.bullets ?? []).map((b: string) => `• ${b}`)].join("\n"),
      ((v.price_cents ?? p.price_cents) / 100).toFixed(2), v.stock, p.weight_g ?? "",
      images.slice(0, 9).join(" | "), p.gpsr_manufacturer, p.gpsr_address, p.gpsr_contact, p.gpsr_warnings ?? "",
    ]);
  });

  const csv = toCsv(
    ["id_merovan", "sku", "titulo", "variante", "descripcion", "precio_eur_iva", "stock", "peso_g", "imagenes",
     "gpsr_fabricante", "gpsr_direccion", "gpsr_contacto", "gpsr_advertencias"],
    rows,
  );
  await audit("exportar_csv", "products", "tiktok_shop", { rows: rows.length });
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="merovan-catalogo-${today}.csv"`,
    },
  });
}
