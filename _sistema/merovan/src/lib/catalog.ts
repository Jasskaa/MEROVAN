import "server-only";
import type { CardProduct } from "@/components/store/product-card";
import { mediaUrl } from "@/lib/store";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

type Media = { storage_path: string; kind: string; position: number };

export const sortedMedia = (m: Media[] | null | undefined) => [...(m ?? [])].sort((a, b) => a.position - b.position);

const NEW_DAYS = 30;

/** Published products for the storefront (RLS already hides drafts), newest first. Optional name search. */
export async function publishedProducts(q?: string): Promise<CardProduct[]> {
  if (!supabaseConfigured) return [];
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("code, name, slug, price_cents, compare_at_cents, created_at, product_media(storage_path, kind, position), product_variants(stock)")
    .eq("publish_status", "publicado")
    .order("created_at", { ascending: false });
  const term = q?.trim().slice(0, 60);
  if (term) query = query.ilike("name", `%${term.replace(/[%_]/g, "")}%`);
  const { data } = await query;
  return (data ?? []).map((p) => ({
    code: p.code, name: p.name, slug: p.slug, price_cents: p.price_cents, compare_at_cents: p.compare_at_cents,
    images: sortedMedia(p.product_media).filter((m) => m.kind === "image").map((m) => mediaUrl(m.storage_path)),
    variants: (p.product_variants ?? []).length,
    isNew: Date.now() - new Date(p.created_at).getTime() < NEW_DAYS * 864e5,
  }));
}
