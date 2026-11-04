# MEROVAN — tienda + backoffice

App de MEROVAN: tienda online propia (en lugar de Shopify) y panel interno (ventas, dinero, visitas, carritos, productos, decisiones).

## Ejecutar en local
```bash
npm install
cp .env.example .env.local   # rellenar con los datos del proyecto Supabase
npm run dev                  # http://localhost:3000
npm test                     # tests (base de datos en memoria + calculadora)
```
Sin `.env.local` la tienda se muestra vacía y `/admin` explica qué falta.

## Base de datos
- Migraciones: `supabase/migrations/` · datos de ejemplo: `supabase/seed.sql`.
- Aplicar en un proyecto Supabase: `npx supabase link` + `npx supabase db push`, o pegar los SQL en el editor.
- Primer usuario: crearlo en Supabase Auth e insertar su fila en `profiles` con `role = 'owner'`.

## Variables de entorno (solo nombres)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

## Estructura
- `src/app/(tienda)` tienda pública · `src/app/admin` panel · `src/app/login`
- `src/lib/domain` lógica de negocio pura (margen, y después motor de decisión)
- `tests/` · `docs/adr/` decisiones técnicas
