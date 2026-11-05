// Shared width of every store page: wide screens use more of the window, phones keep a 16px gutter.
export const SHELL = "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10";

// Main store sections (header and footer). Kept here, not in the client navbar, so server code can read it.
export const NAV = [
  { href: "/#productos", id: "productos", label: "Tienda" },
  { href: "/legal/envios-y-devoluciones", id: "envios", label: "Envíos y devoluciones" },
  { href: "/#ayuda", id: "ayuda", label: "Ayuda" },
];
