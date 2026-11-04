"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireRole } from "@/lib/admin";
import { parseEuros } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const FIN = ["owner", "finanzas"] as const;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(kind: "ok" | "error", msg: string): never {
  revalidatePath("/admin/dinero");
  redirect(`/admin/dinero?${kind}=${encodeURIComponent(msg)}`);
}

export async function addExpense(formData: FormData) {
  const staff = await requireRole(...FIN);
  let amount: number | null, vat: number | null;
  try {
    amount = parseEuros(formData.get("amount"));
    vat = parseEuros(formData.get("vat"));
  } catch (e) {
    back("error", (e as Error).message);
  }
  if (amount == null) back("error", "Indica el importe sin IVA");

  const supabase = await createClient();
  let receiptPath: string | null = null;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) back("error", "El justificante supera 10 MB");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    receiptPath = `${str(formData, "spent_on").slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("receipts").upload(receiptPath, file, { contentType: file.type });
    if (error) back("error", `No se pudo subir el justificante: ${error.message}`);
  }

  const { error } = await supabase.from("expenses").insert({
    spent_on: str(formData, "spent_on"), category: str(formData, "category"), description: str(formData, "description"),
    vendor: str(formData, "vendor") || null, amount_cents: amount, vat_cents: vat ?? 0, receipt_path: receiptPath, created_by: staff.id,
  });
  if (error) back("error", error.message);
  await audit("gasto", "expenses", null, { amount, category: str(formData, "category") });
  back("ok", "Gasto registrado");
}

export async function openReceipt(path: string) {
  await requireRole(...FIN);
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 60);
  if (error || !data) back("error", "No se pudo abrir el justificante");
  redirect(data.signedUrl);
}

export async function updateCompliance(key: string, formData: FormData) {
  await requireRole(...FIN);
  const supabase = await createClient();
  const { error } = await supabase.from("compliance_items").update({
    status: str(formData, "status"), due_on: str(formData, "due_on") || null, notes: str(formData, "notes"),
    updated_at: new Date().toISOString(),
  }).eq("key", key);
  back(error ? "error" : "ok", error?.message ?? "Checklist actualizado");
}
