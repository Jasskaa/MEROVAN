import { Card, Field, Table, Toast, btn, btnGhost, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { CREATOR_STATUSES, human } from "@/lib/marketing";
import { createClient } from "@/lib/supabase/server";
import { createCreator, setCreatorStatus } from "../actions";

export const metadata = { title: "Creadores" };

const TEMPLATE = `Hola [nombre], soy [tu nombre] de MEROVAN. Nos encanta tu contenido sobre [tema].
Nos gustaría enviarte [producto] sin compromiso para que lo pruebes. Si te gusta y quieres colaborar,
la comisión de afiliado es del [X] %. ¿Te interesa? Un saludo.`;

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "marketing", "producto");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const { data: creators } = await supabase.from("creators").select("*, creatives(count)").order("created_at", { ascending: false });
  const canEdit = staff.role === "owner" || staff.role === "marketing";

  return (
    <>
      <Toast ok={ok} error={error} />
      <Card title="Programa de creadores">
        <Table head={["Nombre", "Cuenta", "Contacto", "Comisión", "Creatividades", "Estado"]}>
          {(creators ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.handle ? `${c.handle} · ${c.platform}` : c.platform}</td>
              <td className="text-xs">{c.contact ?? "—"}</td>
              <td className="tabular-nums">{c.commission_pct != null ? `${(c.commission_pct * 100).toFixed(0)} %` : "—"}</td>
              <td className="tabular-nums">{c.creatives?.[0]?.count ?? 0}</td>
              <td>
                {canEdit ? (
                  <form action={setCreatorStatus.bind(null, c.id)} className="flex gap-1">
                    <select name="status" defaultValue={c.status} className={`${input} mt-0 w-44 py-1`} aria-label={`Estado de ${c.name}`}>
                      {CREATOR_STATUSES.map((s) => <option key={s} value={s}>{human(s)}</option>)}
                    </select>
                    <button className={btnGhost}>OK</button>
                  </form>
                ) : human(c.status)}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {canEdit && (
          <Card title="Añadir creador">
            <form action={createCreator} className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre"><input name="name" required className={input} /></Field>
              <Field label="Cuenta" hint="@usuario"><input name="handle" className={input} /></Field>
              <Field label="Plataforma">
                <select name="platform" className={input}><option>tiktok</option><option>instagram</option><option>youtube</option></select>
              </Field>
              <Field label="Contacto" hint="email o canal"><input name="contact" className={input} /></Field>
              <Field label="Comisión (%)"><input name="commission_pct" inputMode="decimal" className={input} /></Field>
              <div className="sm:col-span-2"><Field label="Notas"><textarea name="notes" rows={2} className={input} /></Field></div>
              <div><button className={btn}>Añadir</button></div>
            </form>
          </Card>
        )}
        <Card title="Plantilla de primer contacto">
          <pre className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm">{TEMPLATE}</pre>
          <p className="mt-2 text-xs text-muted">MEROVAN no envía mensajes: copia, personaliza y envía tú desde la plataforma.</p>
        </Card>
      </div>
    </>
  );
}
