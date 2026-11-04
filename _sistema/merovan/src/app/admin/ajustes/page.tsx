import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, Card, Notice, btnGhost, input } from "@/components/ui";
import { audit, requireRole } from "@/lib/admin";
import { date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ajustes" };

async function saveSetting(key: string, formData: FormData) {
  "use server";
  const staff = await requireRole("owner", "finanzas");
  let value: unknown;
  try {
    value = JSON.parse(String(formData.get("value")).replace(/(\d),(\d)/g, "$1.$2"));
  } catch {
    redirect("/admin/ajustes?error=" + encodeURIComponent(`Valor no válido en "${key}". Usa números (0.21) o JSON.`));
  }
  const supabase = await createClient();
  const { data: before } = await supabase.from("settings").select("value").eq("key", key).single();
  const { error } = await supabase
    .from("settings")
    .update({
      value,
      verified: formData.get("verified") === "on",
      last_reviewed_at: new Date().toISOString().slice(0, 10),
      updated_by: staff.id,
    })
    .eq("key", key);
  if (error) redirect("/admin/ajustes?error=" + encodeURIComponent(error.message));
  await audit("cambio_ajuste", "settings", key, { before: before?.value, after: value });
  revalidatePath("/admin", "layout");
  redirect("/admin/ajustes?ok=" + encodeURIComponent(`"${key}" guardado`));
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole("owner", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("*").order("key");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Ajustes</h1>
        <p className="text-sm text-muted">
          Parámetros de cálculo. Los datos de plataformas cambian: márcalos como verificados solo tras comprobarlos en la fuente oficial.
          Porcentajes como fracción (0.21 = 21 %).
        </p>
      </header>
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <Card title="Parámetros">
        <ul className="divide-y divide-border">
          {(settings ?? []).map((s) => (
            <li key={s.key} className="py-3">
              <form action={saveSetting.bind(null, s.key)} className="grid gap-2 sm:grid-cols-[1fr_220px_auto_auto] sm:items-center">
                <div>
                  <p className="font-mono text-xs">{s.key}</p>
                  <p className="text-sm">{s.description}</p>
                  <p className="text-xs text-muted">
                    revisado {date(s.last_reviewed_at)} · {s.verified ? <Badge tone="ok">verificado</Badge> : <Badge tone="danger">a verificar</Badge>}
                  </p>
                </div>
                <input name="value" defaultValue={JSON.stringify(s.value)} className={`${input} mt-0 font-mono`} aria-label={`Valor de ${s.key}`} />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="verified" defaultChecked={s.verified} /> verificado</label>
                <button className={btnGhost}>Guardar</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
