// Thin line icons (1.5px stroke) for the storefront.
type P = { className?: string };
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconBag = ({ className }: P) => <svg {...base} className={className}><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
export const IconTruck = ({ className }: P) => <svg {...base} className={className}><path d="M3 6h11v10H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>;
export const IconReturn = ({ className }: P) => <svg {...base} className={className}><path d="M4 9h11a5 5 0 0 1 0 10H8" /><path d="M8 5 4 9l4 4" /></svg>;
export const IconLock = ({ className }: P) => <svg {...base} className={className}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
export const IconChat = ({ className }: P) => <svg {...base} className={className}><path d="M4 5h16v11H9l-5 4z" /></svg>;
export const IconCheck = ({ className }: P) => <svg {...base} className={className}><path d="m5 12 4.5 4.5L19 7" /></svg>;
export const IconArrow = ({ className }: P) => <svg {...base} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconMenu = ({ className }: P) => <svg {...base} className={className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const IconShield = ({ className }: P) => <svg {...base} className={className}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
export const IconBox = ({ className }: P) => <svg {...base} className={className}><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>;
export const IconStar = ({ className }: P) => <svg width="10" height="10" viewBox="0 0 10 10" className={className} aria-hidden><path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z" fill="currentColor" /></svg>;
