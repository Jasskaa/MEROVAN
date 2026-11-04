import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Card, Field, Notice, Table, btn, input } from "@/components/ui";
import { audit, requireRole } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Proveedores" };

async function createSupplier(formData: FormData) {
  "use server";
  await requireRole("owner", "producto");
  const s = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const supabase = await createClient();
  const { data: code } = await supabase.rpc("next_code", { prefix: "PRV" });
  const reliability = s("reliability");
  const { error } = await supabase.from("suppliers").insert({
    code,
    name: s("name"),
    warehouse_country: s("warehouse_country")?.toUpperCase(),
    platform: s("platform"),
    url: s("url"),
    eu_return_address: s("eu_return_address"),
    reliability: reliability ? Number(reliability) : null,
    notes: s("notes") ?? "",
  });
  if (error) redirect("/admin/proveedores?error=" + encodeURIComponent(error.message));
  await audit("crear_proveedor", "suppliers", code);
  revalidatePath("/admin/proveedores");
  redirect("/admin/proveedores?ok=" + encodeURIComponent(`Proveedor ${code} creado`));
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireRole("owner", "producto", "operaciones", "finanzas");
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*, supplier_offers(count), samples(count)")
    .order("code");
  const canEdit = staff.role === "owner" || staff.role === "producto";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <Card title="Listado">
        <Table head={["ID", "Nombre", "Almacén", "Plataforma", "Fiabilidad", "Devolución UE", "Productos", "Muestras"]}>
          {(suppliers ?? []).map((s) => (
            <tr key={s.id}>
              <td className="font-mono text-xs">{s.code}</td>
              <td>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-gold">{s.name}</a> : s.name}</td>
              <td>{s.warehouse_country ?? "—"}</td>
              <td>{s.platform ?? "—"}</td>
              <td className="tabular-nums">{s.reliability ?? "—"}</td>
              <td>{s.eu_return_address ? "Sí" : "—"}</td>
              <td className="tabular-nums">{s.supplier_offers?.[0]?.count ?? 0}</td>
              <td className="tabular-nums">{s.samples?.[0]?.count ?? 0}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-muted">Las ofertas (coste, envío, plazo) y las muestras se añaden desde la ficha de cada producto.</p>
      </Card>

      {canEdit && (
        <Card title="Nuevo proveedor">
          <form action={createSupplier} className="grid gap-3 sm:grid-cols-3">
            <Field label="Nombre"><input name="name" required className={input} /></Field>
            <Field label="País del almacén" hint="ES, DE, PL…"><input name="warehouse_country" maxLength={2} className={input} /></Field>
            <Field label="Plataforma" hint="BigBuy, CJ, directo…"><input name="platform" className={input} /></Field>
            <Field label="Web"><input name="url" type="url" className={input} /></Field>
            <Field label="Dirección de devolución en la UE"><input name="eu_return_address" className={input} /></Field>
            <Field label="Fiabilidad" hint="0-5"><input name="reliability" type="number" step="0.5" min={0} max={5} className={input} /></Field>
            <div className="sm:col-span-3"><Field label="Notas"><textarea name="notes" rows={2} className={input} /></Field></div>
            <div><button className={btn}>Crear proveedor</button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
