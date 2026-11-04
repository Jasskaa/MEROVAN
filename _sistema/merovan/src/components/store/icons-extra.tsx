type P = { className?: string };
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconSearch = ({ className }: P) => <svg {...base} className={className}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
export const IconArrowUpRight = ({ className }: P) => <svg {...base} className={className}><path d="M7 17 17 7M9 7h8v8" /></svg>;
