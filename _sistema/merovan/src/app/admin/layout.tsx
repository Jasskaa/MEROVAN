import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { ADMIN_NAV, canSee } from "@/lib/nav";
import { getStaff, supabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Panel" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured) return <SetupNotice />;
  const staff = await getStaff();
  if (!staff) redirect("/login");

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-border bg-[#0b0a08] text-[#f2ece1] md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 p-4">
          <Image src="/logo-merovan.webp" alt="" width={48} height={32} />
          <span className="font-serif text-xl tracking-widest">MEROVAN</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {ADMIN_NAV.filter((i) => canSee(staff.role, i)).map((i) => (
            <Link key={i.href} href={i.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-[#2a2620] hover:text-[#d4b483]">
              {i.label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="hidden p-4 text-xs text-[#a39a8a] md:block">
          <p>{staff.name || staff.email}</p>
          <p className="uppercase tracking-wide text-[#d4b483]">{staff.role}</p>
          <button className="mt-2 underline">Cerrar sesión</button>
        </form>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

function SetupNotice() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="font-serif text-3xl">Falta conectar Supabase</h1>
      <p className="mt-4 text-muted">
        Copia <code>.env.example</code> a <code>.env.local</code> y rellena la URL y la clave anónima del proyecto de
        Supabase. Después aplica las migraciones de <code>supabase/migrations</code>.
      </p>
    </main>
  );
}
