import "server-only";
import { cookies, headers } from "next/headers";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

// Strictly necessary cookie (keeps the cart). Set by the middleware on every store request.
export const SESSION_COOKIE = "mv_sid";

export async function sessionId() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export const mediaUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}`;

export interface CartLine {
  variant_id: string;
  sku: string;
  variant_title: string;
  product_name: string;
  slug: string;
  unit_price_cents: number;
  quantity: number;
  stock: number;
  image_path: string | null;
}

export async function cartLines(): Promise<CartLine[]> {
  const sid = await sessionId();
  if (!sid) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("cart_contents", { p_session: sid });
  return (data ?? []) as CartLine[];
}

/** Anonymous page view. Never blocks or breaks the page. */
export async function trackView(path: string, productSlug: string | null, params: Record<string, string | undefined> = {}) {
  const sid = await sessionId();
  if (!sid) return;
  const referrer = (await headers()).get("referer");
  const supabase = await createClient();
  await supabase.rpc("track_view", {
    p_session: sid,
    p_path: path,
    p_product_slug: productSlug,
    p_referrer: referrer,
    p_utm_source: params.utm_source ?? null,
    p_utm_campaign: params.utm_campaign ?? null,
  });
}

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}
