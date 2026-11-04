import type { Role } from "@/lib/supabase/server";

export type NavIcon =
  | "home" | "spark" | "box" | "receipt" | "lifebuoy" | "cart" | "eye" | "coins" | "truck"
  | "calc" | "megaphone" | "check" | "sliders" | "users" | "server" | "user";

// Admin modules, grouped for the sidebar, and which roles can open them (mirrors the RLS policies).
export const ADMIN_NAV: { href: string; label: string; icon: NavIcon; group: string; roles: Role[] | "all" }[] = [
  { href: "/admin", label: "Inicio", icon: "home", group: "General", roles: "all" },
  { href: "/admin/decisiones", label: "Decisiones", icon: "spark", group: "General", roles: ["owner", "producto", "marketing", "finanzas"] },
  { href: "/admin/agentes", label: "Agentes de IA", icon: "server", group: "General", roles: ["owner", "producto", "marketing", "operaciones", "finanzas"] },
  { href: "/admin/configuracion", label: "Configuración", icon: "check", group: "General", roles: ["owner", "producto", "marketing", "operaciones", "finanzas"] },
  { href: "/admin/productos", label: "Productos", icon: "box", group: "Tienda", roles: "all" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "receipt", group: "Tienda", roles: ["owner", "operaciones", "finanzas"] },
  { href: "/admin/soporte", label: "Soporte", icon: "lifebuoy", group: "Tienda", roles: ["owner", "operaciones", "finanzas"] },
  { href: "/admin/carritos", label: "Carritos", icon: "cart", group: "Tienda", roles: "all" },
  { href: "/admin/visitas", label: "Visitas", icon: "eye", group: "Tienda", roles: "all" },
  { href: "/admin/marketing", label: "Marketing", icon: "megaphone", group: "Crecimiento", roles: ["owner", "marketing", "producto", "finanzas"] },
  { href: "/admin/simulador", label: "Simulador", icon: "calc", group: "Crecimiento", roles: ["owner", "producto", "finanzas"] },
  { href: "/admin/proveedores", label: "Proveedores", icon: "truck", group: "Crecimiento", roles: ["owner", "producto", "operaciones", "finanzas"] },
  { href: "/admin/dinero", label: "Dinero", icon: "coins", group: "Gestión", roles: ["owner", "finanzas"] },
  { href: "/admin/aprobaciones", label: "Aprobaciones", icon: "check", group: "Gestión", roles: "all" },
  { href: "/admin/ajustes", label: "Ajustes", icon: "sliders", group: "Gestión", roles: ["owner", "finanzas"] },
  { href: "/admin/equipo", label: "Equipo", icon: "users", group: "Gestión", roles: ["owner"] },
  { href: "/admin/sistema", label: "Sistema", icon: "server", group: "Gestión", roles: ["owner", "producto", "finanzas", "operaciones"] },
  { href: "/admin/cuenta", label: "Mi cuenta", icon: "user", group: "Cuenta", roles: "all" },
];

export const canSee = (role: Role, item: (typeof ADMIN_NAV)[number]) =>
  item.roles === "all" || item.roles.includes(role);
