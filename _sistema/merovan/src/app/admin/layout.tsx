import Link from "next/link";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { logout } from "@/app/login/actions";
import { ADMIN_NAV, canSee } from "@/lib/nav";
import { createClient, getStaff, supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Panel" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured) return <SetupNotice />;
  const staff = await getStaff();
  if (!staff) redirect("/login");

  // Small counters next to the menu items that need attention.
  const supabase = await createClient();
  const [{ count: approvals }, { count: tickets }] = await Promise.all([
    supabase.from("approvals").select("*", { count: "exact", head: true }).eq("status", "pendiente"),
    supabase.from("tickets").select("*", { count: "exact", head: true }).eq("status", "abierto"),
  ]);
  const badges: Record<string, number> = { "/admin/aprobaciones": approvals ?? 0, "/admin/soporte": tickets ?? 0 };
  const items = ADMIN_NAV.filter((i) => canSee(staff.role, i)).map(({ href, label, icon, group }) => ({ href, label, icon, group, badge: badges[href] }));
  const initials = (staff.name || staff.email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");

  return (
    <div className="min-h-screen bg-background md:flex">
      <Sidebar items={items} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 pl-16 backdrop-blur md:px-8">
          <form action="/admin/productos" className="flex w-full max-w-md items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
            <input name="q" placeholder="Buscar productos…" aria-label="Buscar productos" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
          </form>
          <Link href="/" target="_blank" className="ml-auto hidden rounded-xl border border-border px-3 py-2 text-sm hover:bg-background sm:block">Ver tienda ↗</Link>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0e0e0d] text-xs font-semibold text-[#e5d5bc]">{initials}</span>
            </summary>
            <div className="absolute right-0 top-12 w-56 rounded-2xl border border-border bg-surface p-3 shadow-xl">
              <p className="text-sm font-medium">{staff.name || staff.email}</p>
              <p className="text-xs text-muted">{staff.email} · {staff.role}</p>
              <Link href="/admin/cuenta" className="mt-3 block rounded-lg px-2 py-1.5 text-sm hover:bg-background">Mi cuenta</Link>
              <form action={logout}><button className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-danger hover:bg-background">Cerrar sesión</button></form>
            </div>
          </details>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function SetupNotice() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Falta conectar Supabase</h1>
      <p className="mt-4 text-muted">
        Copia <code>.env.example</code> a <code>.env.local</code> y rellena la URL y la clave anónima del proyecto de
        Supabase. Después aplica las migraciones de <code>supabase/migrations</code>.
      </p>
    </main>
  );
}
