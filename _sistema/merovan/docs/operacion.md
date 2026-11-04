# Guía de operación de MEROVAN

Para el equipo. Los procedimientos detallados están en la bóveda (`06-OPERACIONES/SOP-…`).

## Cada día (10-15 min)
1. **Panel** → mira las alertas (tope superado, MATAR pendiente, pedidos sin enviar, incidencias fuera de plazo).
2. **Pedidos** → todo pedido «pagado» se pide al proveedor el mismo día (texto listo en la ficha del pedido). Apunta coste real y seguimiento.
3. **Soporte** → responde las incidencias en menos de 24 h (plantillas en la misma pantalla). Marca «respondida».
4. **Marketing → Importar métricas** → sube el CSV de ayer de TikTok Ads / Meta Ads (por día y por anuncio).
5. La **tarea diaria** (07:00) recalcula las recomendaciones. Si no está programada, pulsa *Decisiones → Recalcular*.

## Cada semana (reunión de decisiones)
1. **Decisiones** → acepta o rechaza cada recomendación (el rechazo exige motivo). Ejecuta lo aceptado en las plataformas y márcalo como «ejecutada».
2. **Sistema → Exportar a Obsidian** (o automático los lunes): actualiza las notas de producto, `08-REPORTES/Semanales/REP-AAAA-SNN` y el historial de decisiones.
3. Comenta el informe semanal **debajo** de la zona automática (lo que escribas fuera de los marcadores no se toca nunca).
4. **Aprobaciones** → el owner revisa publicaciones y cambios de precio pendientes.

## Cada mes (cierre)
1. **Dinero** → elige el mes: beneficio real por producto y canal, gastos, IVA por país.
2. Registra todos los gastos con justificante (PDF o foto).
3. Exporta los 4 CSV para la gestoría (ventas, comisiones, reembolsos, gastos).
4. Revisa el **checklist de cumplimiento** y las fechas fiscales.
5. Comprueba **Sistema**: integraciones en verde, sin errores en el registro de ejecuciones, bóveda con 0 errores.

## Tarea diaria automática
- Ruta: `GET /api/cron/diario` con cabecera `Authorization: Bearer $CRON_SECRET`.
- En Vercel ya está programada en `vercel.json` (06:00 UTC = 07:00 en invierno).
- En un equipo propio: Programador de tareas de Windows → `curl -H "Authorization: Bearer <secreto>" https://<dominio>/api/cron/diario`.
- El informe semanal en Obsidian solo se escribe donde la app puede ver la carpeta de la bóveda (ejecución local). En un servidor
  en la nube, usa *Sistema → Exportar a Obsidian* desde el equipo que tiene la bóveda.

## Copias de seguridad y restauración
- El plan gratuito de Supabase no incluye copias automáticas descargables: haz una copia mensual (y antes de cada migración):
  `npx supabase db dump --db-url "<cadena de conexión>" -f backup-AAAA-MM.sql` (cadena en *Project Settings → Database*; no la guardes en el repositorio).
- Restaurar: crear un proyecto nuevo, `psql "<cadena>" -f backup-AAAA-MM.sql`, actualizar las variables de entorno.
- La bóveda y el código están en Git: `git log` es el historial; sube el repositorio a un remoto privado.
- Los archivos (fotos de productos, justificantes) están en Supabase Storage: descárgalos desde el panel de Supabase en la copia mensual.

## Cuando algo falla
- **Sistema → Registro de ejecuciones**: cada tarea muestra su error y se reintenta una vez.
- **Una plataforma cambia su CSV**: *Marketing → Importar → Mapeo de columnas*, ajusta los nombres y guarda.
- **Cambia una comisión o política**: *Ajustes*, cambia el valor, marca «verificado» y la fecha queda registrada.
