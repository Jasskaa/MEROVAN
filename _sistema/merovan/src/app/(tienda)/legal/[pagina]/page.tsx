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
    <main className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
      <p className="text-[11px] uppercase tracking-[0.28em] text-brass">Información legal</p>
      <h1 className="mt-3 font-serif text-4xl sm:text-5xl">{page.label}</h1>
      <p className="mt-8 border-l-2 border-brass bg-sand/60 px-5 py-4 text-sm leading-relaxed text-stone">
        Texto pendiente de redactar y validar con la gestoría antes de abrir la tienda al público.
      </p>
    </main>
  );
}
