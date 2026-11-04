import "server-only";
import type { CardProduct } from "@/components/store/product-card";
import { mediaUrl } from "@/lib/store";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

type Media = { storage_path: string; kind: string; position: number };

export const sortedMedia = (m: Media[] | null | undefined) => [...(m ?? [])].sort((a, b) => a.position - b.position);

/** Published products for the storefront (RLS already hides drafts). */
export async function publishedProducts(): Promise<CardProduct[]> {
  if (!supabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("code, name, slug, price_cents, compare_at_cents, product_media(storage_path, kind, position)")
    .eq("publish_status", "publicado")
    .order("code");
  return (data ?? []).map((p) => ({
    code: p.code, name: p.name, slug: p.slug, price_cents: p.price_cents, compare_at_cents: p.compare_at_cents,
    images: sortedMedia(p.product_media).filter((m) => m.kind === "image").map((m) => mediaUrl(m.storage_path)),
  }));
}
