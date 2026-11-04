import { notFound } from "next/navigation";
import { LEGAL } from "@/lib/legal";

export function generateStaticParams() {
  return LEGAL.map((l) => ({ pagina: l.slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ pagina: string }> }) {
  const { pagina } = await params;
  const page = LEGAL.find((l) => l.slug === pagina);
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl">{page.label}</h1>
      <p className="mt-4 rounded-md border border-gold px-3 py-2 text-sm">
        Texto pendiente de redactar y validar con la gestoría antes de abrir la tienda al público.
      </p>
    </main>
  );
}
