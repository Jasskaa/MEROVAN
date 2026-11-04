const STYLE = {
  escalar: "border-ok bg-ok/10 text-ok",
  arreglar: "border-gold bg-gold/10 text-gold",
  matar: "border-danger bg-danger/10 text-danger",
  esperar: "border-border text-muted",
} as const;

export function DecisionBadge({ decision }: { decision: string }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${STYLE[decision as keyof typeof STYLE] ?? STYLE.esperar}`}>
      {decision}
    </span>
  );
}
