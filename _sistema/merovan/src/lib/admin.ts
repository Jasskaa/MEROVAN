import "server-only";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { MarginInput } from "@/lib/domain/margin";
import { createClient, getStaff, type Role } from "@/lib/supabase/server";

/** Signed-in staff member with one of `roles`, or redirect to the panel. */
export async function requireRole(...roles: Role[]) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (roles.length && !roles.includes(staff.role)) redirect("/admin?sin_permiso=1");
  return staff;
}

export async function audit(action: string, entity: string, entityId: string | null, details: object = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("audit_log").insert({ actor: user?.id, action, entity, entity_id: entityId, details });
}

/** Service-role client (bypasses RLS). Server only; null if the key is not configured. */
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

type SettingsMap = Record<string, unknown>;

export async function loadSettings(): Promise<SettingsMap> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value");
  return Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));
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
