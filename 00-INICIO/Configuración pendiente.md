---
tipo: guia
id: INI-CONFIG
estado: activo
responsable: owner
tags: [inicio]
creado: 2026-11-04
actualizado: 2026-11-05
---

# Configuración pendiente

En una frase: lo que Jaska tiene que configurar para que los agentes trabajen, por orden de prioridad.

## Datos de la app
<!-- merovan:auto:start -->
_Espejo del Centro de configuración del panel (1/17 hechos). Las claves nunca se escriben aquí._

### ☐ 1. Forma jurídica, gestoría y alta de IVA · gestión externa
TikTok Shop en España exige empresa registrada con NIF/IVA; Stripe y Meta piden datos de empresa para cobrar y verificar.

1. Elige con la gestoría autónomo o SL (SL si sois varios socios).
2. Pide el alta censal (modelo 036/037) y el NIF; valora el alta en OSS si venderéis fuera de España.
3. Abre una cuenta bancaria solo para el negocio.
4. Apunta razón social, NIF y dirección en Ajustes cuando estén.

- **Tiempo:** 1-4 semanas (gestión externa) · **Dónde:** Gestoría; luego Ajustes del panel · **Prueba:** Tienes NIF y certificado de alta

### ☐ 2. Textos legales y aviso de cookies · gestión externa
Obligatorios antes de abrir la tienda al público (RGPD, LSSI, consumo).

1. Pide a la gestoría o a un abogado: aviso legal, condiciones de venta, privacidad, cookies y envíos/devoluciones.
2. Envíamelos y los pongo en las páginas legales.
3. Decidid si las visitas anónimas necesitan consentimiento de cookies.

- **Tiempo:** 1-2 semanas · **Dónde:** Me los pasas como documento · **Prueba:** Las 5 páginas legales muestran el texto definitivo

### ☐ 3. Meta Business Manager y verificación de empresa · gestión externa
Necesario para publicar en Instagram por API con acceso avanzado y para anuncios en Meta.

1. Crea el portfolio en business.facebook.com con el correo de la marca.
2. Añade la página de Facebook y la cuenta de Instagram profesional.
3. Inicia "Verificación de la empresa" (necesita los datos de la empresa del punto 1).
4. Crea una app en developers.facebook.com tipo "Empresa" y solicita instagram_business_content_publish (revisión de la app).

- **Tiempo:** 30 min + días o semanas de revisión · **Dónde:** Credenciales en .env.local (te diré los nombres al conectar) · **Prueba:** La app aparece como verificada y con el permiso aprobado

### ☐ 4. App de TikTok for Developers y auditoría de Content Posting API · gestión externa
Sin la auditoría, lo publicado por API solo puede ser privado (máx. 5 usuarios en 24 h, a verificar). Mientras, se puede enviar como borrador a la bandeja de la app.

1. Crea una cuenta en developers.tiktok.com con el correo de la marca.
2. Crea una app, añade "Login Kit" y "Content Posting API" y solicita video.publish.
3. Rellena la revisión de la app (vídeo de demostración) y después la auditoría de Direct Post.
4. Avísame cuando tengas Client Key y Client Secret (no los pegues en el chat).

- **Tiempo:** 1 h + semanas de revisión (a verificar) · **Dónde:** .env.local: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET · **Prueba:** Una publicación de prueba llega como borrador a tu bandeja de TikTok

### ☐ 5. Cuenta y clave de la API de Anthropic + límite de gasto
Los agentes razonan con Claude. Sin clave funcionan en modo simulado con respuestas de prueba.

1. Entra en console.anthropic.com y crea la cuenta de organización.
2. Settings → Limits: fija un límite mensual (recomendado 30-50 € al empezar).
3. API Keys → Create key, nombre "merovan-dev".
4. Pégala en _sistema/merovan/.env.local como MEROVAN_ANTHROPIC_API_KEY= (nunca en el chat).
5. Pon el mismo tope en Agentes → Límites → Presupuesto mensual de IA.

- **Tiempo:** 10 min · **Dónde:** .env.local: MEROVAN_ANTHROPIC_API_KEY · **Prueba:** Agentes → Sistema muestra "IA conectada" y una ejecución del Orquestador termina en «ok»

### ☑ 6. Clave de servicio de Supabase
Permite altas de equipo, confirmar pagos y que los agentes y la tarea diaria trabajen sin sesión abierta.

1. supabase.com → proyecto merovan-dev → Project Settings → API Keys → Secret keys.
2. Copia la clave.
3. Pégala en .env.local como SUPABASE_SERVICE_ROLE_KEY=.

- **Tiempo:** 5 min · **Dónde:** .env.local: SUPABASE_SERVICE_ROLE_KEY · **Prueba:** Sistema → «Clave de servicio» en verde

### ☐ 7. Stripe en modo prueba
Para probar compras de extremo a extremo sin dinero real. Los datos bancarios solo hacen falta para cobrar de verdad.

1. dashboard.stripe.com → crea la cuenta (puedes saltar los datos bancarios).
2. Activa "Modo de prueba".
3. Desarrolladores → Claves de API → clave secreta sk_test_….
4. Pégala en .env.local como STRIPE_SECRET_KEY=.

- **Tiempo:** 10 min · **Dónde:** .env.local: STRIPE_SECRET_KEY · **Prueba:** Compra con la tarjeta 4242 4242 4242 4242 y el pedido sale «pagado»

### ☐ 8. Límites, presupuestos y niveles de autonomía
Los agentes solo actúan dentro de lo que fijes. Los límites de dinero empiezan en 0 (nada se gasta).

1. Agentes → Límites: margen mínimo, rango de precios, presupuestos de anuncios, muestras y pedidos.
2. Agentes → Autonomía: deja todo en N1 al principio; sube de nivel cuando el historial lo recomiende.
3. Desactiva el modo simulación solo cuando quieras acciones reales.

- **Tiempo:** 20 min · **Dónde:** Panel → Agentes · **Prueba:** Los límites muestran tus valores y la fecha de cambio

### ☐ 9. Correo de la marca
Para soporte, avisos y para dar de alta las cuentas de plataformas.

1. Elige el dominio (ver punto Dominio) o usa provisionalmente un correo dedicado.
2. Crea hola@ y soporte@ (o similares).

- **Tiempo:** 15 min · **Dónde:** Ajustes del panel · **Prueba:** Recibes un correo de prueba

### ☐ 10. Repositorio privado en GitHub
Copia de seguridad del código y de la bóveda; necesario para desplegar en Vercel.

1. github.com → New repository → privado, sin README.
2. Avísame y lo conecto (no hace falta pasarme contraseñas).

- **Tiempo:** 5 min · **Dónde:** Me pasas la URL del repositorio · **Prueba:** El código aparece en GitHub

### ☐ 11. Cuenta de TikTok Shop Seller · gestión externa
Segundo canal de venta. Requiere empresa registrada.

1. seller-es.tiktok.com (o el Seller Center de Europa) → registrar empresa.
2. Sube los documentos de la empresa (los del punto 1).
3. Configura envíos, devoluciones y atención al cliente.

- **Tiempo:** días (revisión) · **Dónde:** Seller Center; credenciales de API más adelante · **Prueba:** La tienda aparece como aprobada

### ☐ 12. Cuenta de TikTok Ads
Para los tests de anuncios. Al principio, solo lectura de informes.

1. ads.tiktok.com → crea la cuenta publicitaria con los datos de empresa.
2. Añade método de pago tú mismo (nunca un agente).
3. Exporta un informe CSV de prueba y súbelo en Marketing → Importar.

- **Tiempo:** 30 min · **Dónde:** TikTok Ads Manager · **Prueba:** El CSV se importa sin errores

### ☐ 13. Cuentas en proveedores (BigBuy, CJ con almacén UE…)
Para comparar ofertas, pedir muestras y enviar pedidos.

1. Crea cuenta en los proveedores que elijamos tras el estudio de nicho.
2. Solicita acceso a su API si lo tienen.
3. Las credenciales van a .env.local con el nombre que te indique.

- **Tiempo:** 30 min por proveedor · **Dónde:** .env.local · **Prueba:** El agente de Proveedores lee el catálogo de prueba

### ☐ 14. Dominio y despliegue en Vercel
Para que la tienda sea pública en internet.

1. Compra el dominio (p. ej. merovan.es).
2. Crea cuenta en vercel.com con GitHub.
3. Importa el repositorio y pega las variables de entorno en Vercel.
4. Apunta el dominio a Vercel.

- **Tiempo:** 1 h · **Dónde:** Vercel → Environment Variables · **Prueba:** La tienda abre en tu dominio con https

### ☐ 15. Protección de contraseñas filtradas y verificación en dos pasos
Reduce el riesgo de acceso indebido al panel.

1. Supabase → Authentication → Settings → activa la protección de contraseñas filtradas (si tu plan lo permite).
2. Más adelante activaremos el segundo factor (TOTP) en el login.

- **Tiempo:** 5 min · **Dónde:** Panel de Supabase · **Prueba:** El asesor de seguridad ya no muestra el aviso

### ☐ 16. Copias de seguridad mensuales
El plan gratuito de Supabase no hace copias descargables.

1. Sigue docs/operacion.md → Copias de seguridad.
2. Guarda la copia fuera del ordenador (nube privada).

- **Tiempo:** 15 min/mes · **Dónde:** Tu almacenamiento privado · **Prueba:** Existe una copia del mes

### ☐ 17. Herramientas de vídeo/imagen y fotos reales
El agente de Contenido necesita una herramienta de generación conectada y fotos/vídeos con derechos de uso.

1. Decide qué herramienta usar (te propondré opciones con API oficial).
2. Cuando lleguen las muestras, graba vídeos y fotos propias.

- **Tiempo:** variable · **Dónde:** .env.local y Productos → fotos · **Prueba:** Una creatividad de prueba se genera en borrador
<!-- merovan:auto:end -->
