import Link from "next/link";
import { requireRole } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

const TABS = [
  { href: "/admin/agentes", label: "Resumen" },
  { href: "/admin/agentes/bandeja", label: "Bandeja de aprobaciones" },
  { href: "/admin/agentes/investigacion", label: "Investigación" },
  { href: "/admin/agentes/actividad", label: "Actividad" },
  { href: "/admin/agentes/autonomia", label: "Autonomía" },
  { href: "/admin/agentes/limites", label: "Límites" },
];

export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  await requireRole("owner", "producto", "marketing", "operaciones", "finanzas");
  const supabase = await createClient();
  const [{ data: state }, { count: pending }] = await Promise.all([
    supabase.from("system_state").select("kill_switch, kill_reason, dry_run").single(),
    supabase.from("agent_proposals").select("*", { count: "exact", head: true }).eq("status", "pendiente"),
  ]);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agentes de IA</h1>
          <p className="text-sm text-muted">Los agentes proponen; el sistema de autonomía y los límites deciden qué se ejecuta.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {state?.kill_switch
            ? <span className="rounded-full bg-[#fef3f2] px-3 py-1.5 font-semibold text-danger">● PARADA GLOBAL ACTIVA</span>
            : <span className="rounded-full bg-[#ecfdf3] px-3 py-1.5 font-semibold text-ok">● En marcha</span>}
          {state?.dry_run
            ? <span className="rounded-full bg-gold-soft px-3 py-1.5 font-semibold text-gold">Modo simulación</span>
            : <span className="rounded-full bg-[#0e0e0d] px-3 py-1.5 font-semibold text-white">Acciones reales</span>}
        </div>
      </header>
      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 text-sm">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-muted hover:bg-background hover:text-foreground">
            {t.label}{t.href.endsWith("bandeja") && pending ? <span className="ml-1.5 rounded-full bg-gold-soft px-1.5 text-[11px] font-semibold text-gold">{pending}</span> : null}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
