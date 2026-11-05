import "server-only";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { loadSettings as loadSettingsFrom, marginDefaults } from "@/lib/settings";
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

/** Settings of the session's client by default (re-exported from the pure settings module). */
export async function loadSettings(client?: Parameters<typeof loadSettingsFrom>[0]) {
  return loadSettingsFrom(client ?? (await createClient()));
}
export { marginDefaults };
