import { redirect } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import { SetupForm } from "./form";

export const metadata = { title: "Alta inicial" };
export const dynamic = "force-dynamic";

// Only reachable while no owner exists.
export default async function SetupPage() {
  if (!supabaseConfigured) redirect("/admin");
  const { data: exists } = await (await createClient()).rpc("owner_exists");
  if (exists) redirect("/login");
  return <SetupForm />;
}
