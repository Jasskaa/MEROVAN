import type { Metadata } from "next";
import { Anton, Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["500", "600"] });
// Condensed display face for the storefront's large editorial headings.
const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });

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
