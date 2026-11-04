import "server-only";
import { serviceClient } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { AnthropicModel, type ModelClient, ScriptedModel, callTool, hasApiKey, say } from "./model";
import { SupabaseStore } from "./supabase-store";

export async function storeFor(actor: string | null) {
  return new SupabaseStore(await createClient(), actor);
}

export function serviceStore() {
  const db = serviceClient();
  return db ? new SupabaseStore(db, null) : null;
}

/** Real Claude when MEROVAN_ANTHROPIC_API_KEY is set; otherwise a harmless scripted demo run. */
export function modelFor(): ModelClient {
  if (hasApiKey()) return new AnthropicModel();
  return new ScriptedModel([
    () => ({ content: [callTool("estado_sistema", {}), callTool("propuestas", { status: "pendiente" })] }),
    () => ({ content: [say("Modo de prueba sin clave de IA: he leído el estado y las propuestas pendientes, pero no he razonado con Claude. Pega MEROVAN_ANTHROPIC_API_KEY en .env.local para activar a los agentes de verdad.")] }),
  ]);
}
