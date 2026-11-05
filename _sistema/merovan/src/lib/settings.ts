// Editable business settings (settings table) and the margin defaults derived from them.
// No Next.js imports: also used by the MEROVAN tool server outside the app (mcp/server.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarginInput } from "@/lib/domain/margin";

export type SettingsMap = Record<string, unknown>;

// Any Supabase client works here: the user's session (RLS) or the service role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export async function loadSettings(client: Client): Promise<SettingsMap> {
  const { data } = await client.from("settings").select("key, value");
  return Object.fromEntries((data ?? []).map((s: { key: string; value: unknown }) => [s.key, s.value]));
}

/** Margin defaults taken from the editable settings table. */
export function marginDefaults(s: SettingsMap): Omit<MarginInput, "priceWithVat" | "productCost" | "shippingCost"> {
  const fee = (s.payment_fee ?? {}) as { pct?: number; fixed_cents?: number };
  return {
    vatRate: Number(s.vat_default ?? 0.21),
    platformCommissionPct: 0,
    paymentFeePct: fee.pct ?? 0.014,
    paymentFeeFixed: (fee.fixed_cents ?? 25) / 100,
    returnsProvisionPct: Number(s.returns_provision ?? 0.06),
    otherCosts: 0,
    targetRoasFactor: Number(s.target_roas_factor ?? 1.4),
    testBudgetMultiplier: Number(s.test_budget_multiplier ?? 4),
  };
}
