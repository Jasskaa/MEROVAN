---
tipo: guia
id: INI-ESTADO
estado: activo
responsable: owner
creado: 2026-11-05
actualizado: 2026-11-05
tags: [inicio]
---

# Estado del proyecto

En una frase: dónde estamos, qué funciona y cuál es el siguiente paso; Claude Code lo lee al empezar cada sesión (ver `CLAUDE.md`).

_Última actualización: 5 de noviembre de 2026 (tarde)._

## ⚠️ Ahora mismo: prueba de publicación activa
Los 3 productos (PRD-0001, PRD-0002, PRD-0003) están **publicados en https://merovan.vercel.app como prueba**:
GPSR de los proveedores previstos (Inodorina/Rinaldo Franco y Relaxdays) marcado «pendiente de confirmar», imagen ilustrativa
generada con IA (1200×1200) y **stock 0** (nadie puede comprarlos). Ver [[Investigación de productos noviembre 2026]].

**Cuando Jaska diga «despublica»**, dejarlos como antes de la prueba: `publish_status = 'borrador'` (estado `idea`),
`gpsr_manufacturer/address/contact/warnings = null`, borrar sus filas de `product_media` y sus archivos en el bucket
`product-media`, stock 0, precios y textos sin cambios. Los proveedores PRV-0003 (Relaxdays) y PRV-0004 (Inodorina) se quedan.

## Hecho
- **Bóveda de Obsidian** con convenciones, índices, plantillas, roadmap y exportador automático desde la app.
- **Tienda propia** (catálogo, ficha, carrito, pago con Stripe Checkout, páginas legales provisionales) y **panel** de administración
  (productos, proveedores, muestras, márgenes, marketing, decisiones, pedidos, soporte, dinero, equipo, sistema).
- **12 agentes de IA**, fases 1-7 del plan de agentes, todos en **modo simulación**:
  Jefe de operaciones, Cumplimiento, Investigador, Proveedores, Precios, Fichas, Contenido, Publicación, Anuncios, Analista,
  Operaciones y soporte, Finanzas. Autonomía N0-N3, límites duros (dinero a 0), parada global manual y automática, bandeja de
  aprobaciones, cola de tareas, informes en [[Agentes de IA]] y [[Aprendizajes de los agentes]].
- **145 tests + 18 E2E** en verde, checklist de seguridad en `_sistema/merovan/docs/seguridad.md`.
- **GitHub**: `Jasskaa/MEROVAN` (rama `main`). **Vercel**: https://merovan.vercel.app funcionando (tienda, carrito, login).

## Pendiente de Jaska (ver [[Configuración pendiente]])
1. `MEROVAN_ANTHROPIC_API_KEY` (con límite de gasto en la consola de Anthropic) → los agentes trabajan de verdad.
2. ~~`SUPABASE_SERVICE_ROLE_KEY`~~ ✅ hecha (local y Vercel, 5/11/2026).
3. Stripe en modo prueba (`STRIPE_SECRET_KEY`, luego webhook) → compra de prueba de extremo a extremo.
4. Límites en Panel → Agentes → Límites (anuncios, muestras, pedidos, reembolsos).
5. Trámites largos: empresa/NIF (gestoría), textos legales, Meta Business, TikTok for Developers, TikTok Shop.
6. En Vercel, como **Secret**: las claves anteriores y `CRON_SECRET`. En Supabase: Site URL = https://merovan.vercel.app.

## Herramientas
- Portal sin commits: herramientas `merovan` (MCP) o `npm run --silent merovan -- <herramienta> '<json>'` desde `_sistema/merovan`.
- Claves en `.env.local`: Supabase (URL, anónima y **servicio** ✅), CRON ✅; faltan IA y Stripe. En Vercel: URL y anónima (Config) y servicio (Secret) ✅.

## Siguiente paso
- **Con la clave de IA**: primera ejecución real del Jefe de operaciones + «Procesar pendientes», revisar Investigación y Bandeja,
  ajustar instrucciones de los agentes y comprobar el coste real.
- **Sin claves, Claude puede adelantar**: verificación en dos pasos (TOTP) para el panel, preparar dominio propio y Stripe.
- Después: elegir nicho con los datos del Investigador, pedir muestras y empezar el juego real.

## No está hecho (honesto)
- Ningún agente se ha ejecutado aún con IA real (solo pruebas guionizadas).
- Integraciones externas sin conectar (TikTok, Meta, anuncios, proveedores, correo, reembolsos en Stripe): al aprobar fuera de
  simulación fallan con «Integración no conectada» y se hacen a mano.
- Sin dominio propio, sin textos legales definitivos, sin 2FA y con copias de seguridad manuales.
- Base de datos y bóveda limpias (5/11/2026). Primeros borradores (sin publicar, costes estimados): PRD-0001 y PRD-0002 rodillo quitapelos, PRD-0003 Kit para guardar la Navidad. Ver [[Investigación de productos noviembre 2026]].
