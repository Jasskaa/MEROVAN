import { notFound } from "next/navigation";
import { ADMIN_NAV } from "@/lib/nav";

// Placeholder for modules built in later phases.
const PHASE: Record<string, string> = {
  pedidos: "F",
  carritos: "C",
  visitas: "C",
  dinero: "F",
  marketing: "D",
  aprobaciones: "C",
};

export default async function Section({ params }: { params: Promise<{ seccion: string }> }) {
  const { seccion } = await params;
  const item = ADMIN_NAV.find((i) => i.href === `/admin/${seccion}`);
  if (!item) notFound();
  return (
    <div>
      <h1 className="font-serif text-3xl">{item.label}</h1>
      <p className="mt-4 text-muted">Este módulo se construye en la Fase {PHASE[seccion]}.</p>
    </div>
  );
}
