# MEROVAN — tienda propia + backoffice

Una sola app con dos caras:

- **Tienda** (`/`): catálogo, ficha con GPSR, carrito anónimo y pago con Stripe Checkout.
- **Panel** (`/admin`): decisiones escalar/arreglar/matar, productos, pedidos, soporte, carritos, visitas, dinero,
  proveedores, simulador de margen, marketing, aprobaciones, ajustes, equipo y sistema.

La bóveda de Obsidian (carpeta superior) es la memoria del equipo; esta app es la fuente de verdad de los números.

## Ejecutar en local
```bash
npm install
cp .env.example .env.local   # rellenar (ver docs/integraciones.md)
npm run dev                  # http://localhost:3000 (en este equipo: npm run dev -- --port=5190)
```

| Comando | Qué hace |
|---|---|
| `npm test` | Tests unitarios y de base de datos (PGlite: reconstruye la BD desde las migraciones) |
| `npm run e2e` | Pruebas E2E con Playwright (tienda, carrito, seguridad), escritorio y móvil |
| `npm run vault:check` | Comprobador de calidad de la bóveda de Obsidian (0 errores = OK) |
| `npm run lint` · `npx tsc --noEmit` | Calidad y tipos |

## Variables de entorno (solo nombres)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `VAULT_PATH`.

## Base de datos
- Migraciones en `supabase/migrations/` (en orden), datos de ejemplo en `supabase/seed.sql`.
- Los archivos con `storage` en el nombre solo existen en Supabase (los tests los omiten).
- RLS en todas las tablas; la tienda pública solo usa funciones RPC acotadas (nunca escribe en tablas).

## Estructura
- `src/app/(tienda)` tienda · `src/app/admin` panel · `src/app/api` webhook de Stripe y tarea diaria
- `src/lib/domain` lógica de negocio pura y testeada: margen, producto, ficha, métricas, importación CSV, decisión, beneficio real
- `src/lib/obsidian` exportador a la bóveda y comprobador de calidad
- `tests/` unitarios + BD · `e2e/` Playwright · `docs/` guías y decisiones

## Documentación
- [Guía de operación](docs/operacion.md): rutinas diarias, semanales y mensuales.
- [Integraciones](docs/integraciones.md): credenciales, permisos mínimos, límites y modo manual.
- [Seguridad](docs/seguridad.md): checklist y decisiones.
- [Decisiones técnicas](docs/adr/).
