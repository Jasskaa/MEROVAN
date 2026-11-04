import "server-only";
import { serviceClient } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { demoModel } from "./demo";
import { AnthropicModel, type ModelClient, hasApiKey } from "./model";
import { SupabaseStore } from "./supabase-store";

export async function storeFor(actor: string | null) {
  return new SupabaseStore(await createClient(), actor);
}

export function serviceStore() {
  const db = serviceClient();
  return db ? new SupabaseStore(db, null) : null;
}

/** Real Claude when MEROVAN_ANTHROPIC_API_KEY is set; otherwise a harmless scripted demo run of that agent. */
export function modelFor(agent = "orquestador"): ModelClient {
  if (hasApiKey()) return new AnthropicModel();
  return demoModel(agent);
}
