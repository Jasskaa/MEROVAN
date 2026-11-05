import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are bundled (OFL, see fonts/LICENCIAS.txt) so builds never depend on reaching Google Fonts.
const inter = localFont({ variable: "--font-inter", src: "./fonts/inter-latin-wght.woff2", weight: "100 900", display: "swap" });
const cormorant = localFont({
  variable: "--font-cormorant", display: "swap",
  src: [{ path: "./fonts/cormorant-garamond-500.woff2", weight: "500" }, { path: "./fonts/cormorant-garamond-600.woff2", weight: "600" }],
});
// Condensed display face for the storefront's large editorial headings.
const anton = localFont({ variable: "--font-anton", src: "./fonts/anton-400.woff2", weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MEROVAN", template: "%s · MEROVAN" },
  description: "Tienda online MEROVAN: productos útiles, probados y enviados desde Europa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${cormorant.variable} ${anton.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
