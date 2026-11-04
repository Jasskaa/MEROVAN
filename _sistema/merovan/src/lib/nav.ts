import type { Role } from "@/lib/supabase/server";

// Admin modules and which roles can open them (mirrors the RLS policies).
export const ADMIN_NAV: { href: string; label: string; roles: Role[] | "all" }[] = [
  { href: "/admin", label: "Panel", roles: "all" },
  { href: "/admin/decisiones", label: "Decisiones", roles: ["owner", "producto", "marketing", "finanzas"] },
  { href: "/admin/productos", label: "Productos", roles: "all" },
  { href: "/admin/pedidos", label: "Pedidos", roles: ["owner", "operaciones", "finanzas"] },
  { href: "/admin/soporte", label: "Soporte", roles: ["owner", "operaciones", "finanzas"] },
  { href: "/admin/carritos", label: "Carritos", roles: "all" },
  { href: "/admin/visitas", label: "Visitas", roles: "all" },
  { href: "/admin/dinero", label: "Dinero", roles: ["owner", "finanzas"] },
  { href: "/admin/proveedores", label: "Proveedores", roles: ["owner", "producto", "operaciones", "finanzas"] },
  { href: "/admin/simulador", label: "Simulador", roles: ["owner", "producto", "finanzas"] },
  { href: "/admin/marketing", label: "Marketing", roles: ["owner", "marketing", "producto", "finanzas"] },
  { href: "/admin/aprobaciones", label: "Aprobaciones", roles: "all" },
  { href: "/admin/ajustes", label: "Ajustes", roles: ["owner", "finanzas"] },
  { href: "/admin/equipo", label: "Equipo", roles: ["owner"] },
  { href: "/admin/cuenta", label: "Mi cuenta", roles: "all" },
];

export const canSee = (role: Role, item: (typeof ADMIN_NAV)[number]) =>
  item.roles === "all" || item.roles.includes(role);
