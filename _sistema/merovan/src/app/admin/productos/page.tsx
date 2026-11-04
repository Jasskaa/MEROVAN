import Link from "next/link";
import { Badge, Card, Notice, Table, btn, input } from "@/components/ui";
import { requireRole } from "@/lib/admin";
import { SCORE_THRESHOLD, statusLabel } from "@/lib/domain/product";
import { eur } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createProduct } from "./actions";

export const metadata = { title: "Productos" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ error?: string; estado?: string }> }) {
  const staff = await requireRole();
  const { error, estado } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("code, name, status, publish_status, price_cents, score, legal_red_flag, updated_at")
    .order("code", { ascending: false });
  if (estado) query = query.eq("status", estado);
  const { data: products } = await query;
  const canEdit = staff.role === "owner" || staff.role === "producto";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Productos</h1>
          <p className="text-sm text-muted">{products?.length ?? 0} productos{estado ? ` · ${statusLabel(estado)}` : ""}</p>
        </div>
        {canEdit && (
          <form action={createProduct} className="flex gap-2">
            <input name="name" required placeholder="Nombre del nuevo producto" className={`${input} mt-0 w-64`} aria-label="Nombre del nuevo producto" />
            <button className={btn}>+ Nuevo producto</button>
          </form>
        )}
      </header>
      {error && <Notice tone="danger">{error}</Notice>}

      <Card title="Catálogo">
        <Table head={["ID", "Producto", "Estado", "Tienda", "Puntuación", "Precio"]}>
          {(products ?? []).map((p) => (
            <tr key={p.code}>
              <td className="font-mono text-xs">{p.code}</td>
              <td>
                <Link href={`/admin/productos/${p.code}`} className="font-medium hover:text-gold">{p.name}</Link>
                {p.legal_red_flag && <span className="ml-2"><Badge tone="danger">bandera roja</Badge></span>}
              </td>
              <td>{statusLabel(p.status)}</td>
              <td><Badge tone={p.publish_status === "publicado" ? "ok" : "neutral"}>{p.publish_status.replaceAll("_", " ")}</Badge></td>
              <td className="tabular-nums">
                {p.score == null ? "—" : <Badge tone={p.score >= SCORE_THRESHOLD ? "ok" : "danger"}>{p.score}/40</Badge>}
              </td>
              <td className="tabular-nums">{p.price_cents != null ? eur(p.price_cents) : "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
