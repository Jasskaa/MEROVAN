// Small shared UI pieces for the admin panel (Tailwind only).

export const input =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold";
export const btn =
  "inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm hover:border-gold";

export function Card({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-serif text-xl">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="ml-1 text-xs text-muted">· {hint}</span>}
      {children}
    </label>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "danger" | "gold"; children: React.ReactNode }) {
  const tones = {
    neutral: "border-border text-muted",
    ok: "border-ok text-ok",
    danger: "border-danger text-danger",
    gold: "border-gold text-gold",
  };
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "danger" | "ok"; children: React.ReactNode }) {
  const tones = { neutral: "border-border", danger: "border-danger text-danger", ok: "border-ok text-ok" };
  return <div className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

/** Result message pinned to the bottom of the screen, visible wherever the form was. */
export function Toast({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div role={error ? "alert" : "status"}
      className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-lg border px-4 py-3 text-sm shadow-lg bg-surface ${error ? "border-danger text-danger" : "border-ok text-ok"}`}>
      {error ?? ok}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>{head.map((h) => <th key={h} className="p-2 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-border [&_td]:p-2">{children}</tbody>
      </table>
    </div>
  );
}
