# Agentes de IA — guía de uso

## Los 12 agentes
| Agente | Qué hace | Qué puede proponer |
|---|---|---|
| Jefe de operaciones | Planifica el día y encarga tareas | — (delega) |
| Cumplimiento | Revisa propuestas y fichas; puede vetar | Veredictos |
| Investigador | 3 nichos con candidatos puntuados | — |
| Proveedores | Ofertas, principal y respaldo | Muestras, primer contacto (siempre humano) |
| Precios | Precio x,95 € con margen mínimo | Cambio de precio |
| Fichas | Textos, validación | Publicar producto |
| Contenido | Guiones y creatividades | — |
| Publicación | Calendario de 7 días | Publicar contenido |
| Anuncios | Pausas por reglas y presupuestos | Pausar anuncio, presupuesto |
| Analista | Motor de decisión y aprendizajes | — (encarga tareas) |
| Operaciones y soporte | Pedidos, tickets, devoluciones | Pedido a proveedor, respuesta, reembolso |
| Finanzas | Beneficio real y conciliación | — (nunca mueve dinero) |

## Uso diario
1. **Agentes → Resumen**: ejecuta un agente con una instrucción, o el Jefe de operaciones para que reparta el trabajo.
2. **Procesar pendientes** (en «Tareas encargadas») ejecuta las tareas que los agentes se han encargado entre sí.
   Con la clave de IA, la tarea diaria (`/api/cron/diario`) lo hace sola.
3. **Bandeja de aprobaciones**: aprueba o rechaza (con motivo). Puedes aprobar varias a la vez.
4. **Investigación**: nichos, candidatos, proveedor, precio y margen; «Crear producto» convierte un candidato en idea.
5. **Actividad**: cada ejecución, su coste y cada herramienta usada.
6. Obsidian: **Agentes de IA** (semana) y **Aprendizajes de los agentes**, al exportar desde Sistema.

## Seguridad
- **PARAR TODO** detiene cualquier acción externa; se activa sola con 5 reembolsos en 24 h o 3 errores de una herramienta en 1 h.
- **Modo simulación** (activado por defecto): todo se hace, nada externo es real. Desactívalo solo con límites e integraciones listos.
- Los **límites de dinero empiezan en 0**: nada se gasta hasta que los pongas en Límites.
- Siempre humano, sea cual sea el nivel: primer contacto con proveedores o creadores, contratos, aceptar términos, pagos y
  datos bancarios, fiscalidad, datos de la empresa, borrar datos de clientes. Cambiar límites o niveles solo desde el panel.

## Cuándo subir de nivel (guía de promoción)
| Nivel | Significa | Súbelo cuando… |
|---|---|---|
| N0 | Solo observa | — |
| N1 | Prepara borradores | Punto de partida para todo |
| N2 | Se ejecuta al aprobarlo | ≥ 10 propuestas de ese tipo aprobadas sin cambios y 0 rechazos por error grave |
| N3 | Se ejecuta solo dentro de los límites | ≥ 20 aprobadas en N2, ≥ 4 semanas sin incidencias y límites ajustados a lo que aceptas perder |

- **Autonomía** muestra aprobadas/rechazadas por tipo y avisa cuando un tipo cumple el umbral (`promotion_min_approved`).
- Empieza por acciones de **riesgo bajo** (pausar anuncios) y deja en N2 lo que mueve dinero o publica.
- Un rechazo por error grave (claim, precio, cliente) devuelve el tipo a N1.
- Las acciones «siempre humano» nunca pasan de N2.

## Coste de IA
- Presupuesto mensual en **Límites** (por defecto 30 $); aviso al 80 % y parada al 100 %.
- Las ejecuciones de prueba sin clave cuestan 0.
