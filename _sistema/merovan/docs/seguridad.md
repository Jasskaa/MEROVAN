# Seguridad — checklist (revisado el 04/11/2026)

| # | Control | Estado | Dónde |
|---|---|---|---|
| 1 | RLS activada en **todas** las tablas (33/33) y vistas con `security_invoker` | ✅ | migraciones; comprobado en Supabase |
| 2 | Permisos por rol: clientes solo owner/operaciones/finanzas; costes no visibles para marketing/lectura | ✅ | políticas RLS + tests `db.test.ts` |
| 3 | La tienda pública no escribe en tablas: solo RPC acotadas, precios siempre desde la BD | ✅ | `20261104000006_store.sql` + tests |
| 4 | Marcar un pedido como pagado solo con webhook **firmado** por Stripe (función no ejecutable por anon/authenticated) | ✅ | `api/stripe/webhook`, tests |
| 5 | Humano en el bucle: publicar y cambiar precios publicados requieren aprobación del owner; el sistema no gasta, no publica en plataformas y no envía mensajes | ✅ | Aprobaciones, guardas en BD |
| 6 | Registro de auditoría **inmutable** (trigger impide modificar/borrar) | ✅ | `audit_log` + test |
| 7 | Ningún secreto en el repositorio (`.env*` ignorado; búsqueda de claves = 0 resultados) | ✅ | `.gitignore`, revisión |
| 8 | Clave de servicio solo en servidor (`server-only`), nunca en el navegador | ✅ | `lib/admin.ts` |
| 9 | Cabeceras: CSP, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS en producción; panel `noindex` y `no-store` | ✅ | `next.config.ts`, test E2E |
| 10 | Límites de peticiones: login, carrito y pago | ✅ | `lib/rate-limit.ts` |
| 11 | Validación de entradas con Zod / validadores propios; CSV protegido contra fórmulas | ✅ | acciones, `csv.ts` |
| 12 | Tarea diaria protegida con secreto (comparación en tiempo constante) | ✅ | `api/cron/diario` |
| 13 | Datos personales fuera de las URLs (contraseñas temporales y datos RGPD por cookie httpOnly de 2 min) | ✅ | Equipo, Sistema |
| 14 | RGPD: consulta y anonimización por correo, retención automática configurable, mínimos datos (sin dirección) | ✅ | Sistema, `apply_retention()` |
| 15 | Justificantes de gastos en almacén **privado** con enlaces firmados de 60 s | ✅ | bucket `receipts` |
| 16 | Registro cerrado: el primer usuario es owner, el resto lo da de alta el owner | ✅ | trigger `handle_new_user` + test |
| 17 | Protección de contraseñas filtradas (HaveIBeenPwned) | ⚠️ pendiente | Supabase → Authentication → Settings (puede requerir plan de pago) |
| 18 | 2FA para el panel | ⚠️ pendiente | Supabase Auth MFA (TOTP): siguiente mejora |
| 19 | Copias de seguridad | ⚠️ manual | ver `operacion.md` |

## Avisos del asesor de Supabase aceptados
- *SECURITY DEFINER ejecutable por anon*: `track_view`, `cart_set`, `cart_contents`, `checkout_create_order`, `order_lines`, `owner_exists`.
  Son intencionados: es la API pública de la tienda. Validan la sesión, solo tocan productos publicados y toman los precios de la BD.
- *Varias políticas permisivas* (rendimiento): las tablas tienen una política de lectura y otra de escritura por rol; con el volumen
  previsto no tiene impacto. Revisar si alguna tabla supera ~1 M de filas.
