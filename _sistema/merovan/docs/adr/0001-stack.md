# ADR 0001 — Stack técnico

- **Next.js 15 (App Router) + TypeScript + Tailwind 4**: tienda pública y panel en una sola app.
- **Supabase** (Postgres, Auth, Storage): RLS en todas las tablas; migraciones en `supabase/migrations`.
- **Stripe Checkout** (Fase C/F): la tarjeta nunca pasa por nuestros servidores.
- **Vitest + PGlite**: la base de datos se reconstruye desde las migraciones en cada test, sin Docker.
- **shadcn/ui** se añadirá cuando haya formularios complejos (Fase B); de momento basta Tailwind.
- Importes en céntimos (enteros) en la base de datos; la calculadora trabaja en euros con redondeo a 2 decimales.
