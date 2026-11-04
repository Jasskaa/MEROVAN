// Shared labels for the marketing module.

export const ANGLES = [
  { key: "problema", label: "Problema" },
  { key: "demostracion", label: "Demostración" },
  { key: "antes_despues", label: "Antes / después" },
  { key: "comparacion", label: "Comparación" },
  { key: "prueba_social", label: "Prueba social real" },
  { key: "unboxing", label: "Unboxing" },
  { key: "otro", label: "Otro" },
] as const;

export const CREATIVE_STATUSES = ["idea", "guion", "grabado", "editado", "aprobado", "publicado", "retirado"] as const;
export const SCRIPT_STATUSES = ["borrador", "revisado", "aprobado"] as const;
export const CREATOR_STATUSES = ["contactado", "muestra_enviada", "contenido_publicado", "afiliado", "descartado"] as const;
export const CAMPAIGN_STATUSES = ["borrador", "activa", "pausada", "finalizada"] as const;
export const PLATFORMS = [
  { key: "tiktok", label: "TikTok Ads" },
  { key: "meta", label: "Meta Ads" },
  { key: "tiktok_shop", label: "TikTok Shop" },
] as const;

export const angleLabel = (k: string) => ANGLES.find((a) => a.key === k)?.label ?? k;
export const platformLabel = (k: string) => PLATFORMS.find((p) => p.key === k)?.label ?? k;
export const human = (s: string) => s.replaceAll("_", " ");

export const MARKETING_TABS = [
  { href: "/admin/marketing/analisis", label: "Análisis" },
  { href: "/admin/marketing/creatividades", label: "Creatividades" },
  { href: "/admin/marketing/guiones", label: "Guiones" },
  { href: "/admin/marketing/creadores", label: "Creadores" },
  { href: "/admin/marketing/campanas", label: "Campañas" },
  { href: "/admin/marketing/calendario", label: "Calendario" },
  { href: "/admin/marketing/importar", label: "Importar métricas" },
];
