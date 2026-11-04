import Link from "next/link";
import { requireRole } from "@/lib/admin";
import { MARKETING_TABS } from "@/lib/marketing";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await requireRole("owner", "marketing", "producto", "finanzas", "lectura");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <nav className="mt-3 flex gap-1 overflow-x-auto border-b border-border text-sm">
          {MARKETING_TABS.map((t) => (
            <Link key={t.href} href={t.href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 hover:border-gold hover:text-gold">
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
