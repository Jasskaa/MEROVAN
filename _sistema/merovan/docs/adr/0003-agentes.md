# ADR 0003 — Agencia operada por agentes de IA

- **Bucle de herramientas propio con el SDK oficial de Anthropic** (no Managed Agents): las herramientas leen y escriben en
  nuestra base de datos con las mismas reglas RLS que el panel, y cada llamada se valida con Zod y queda registrada en
  `agent_actions`. Modelo por defecto `claude-opus-5-5`, pensamiento adaptativo y prompt de sistema en caché.
- **Los agentes proponen; el sistema decide.** Toda acción externa pasa por `propose()` → Cumplimiento (veto) → motor de
  autonomía (N0-N3, límites duros, parada global, simulación). Un trigger en la BD (`proposal_guard`) impide ejecutar con la
  parada activa, propuestas vetadas o en borrador, aunque falle el código.
- **Los números los calcula el sistema, no el modelo**: puntuación de candidatos, plan de proveedor, precio y margen,
  veredicto de anuncios, beneficio real y conciliación son funciones puras con tests. El agente solo elige qué pedir.
- **Datos externos como datos**: fichas, tickets, ofertas y métricas llegan envueltos en `<datos_externos>`; las
  instrucciones que contengan no se siguen (evaluado en tests).
- **Sin datos personales en los agentes**: Operaciones trabaja con números de pedido e importes.
- **Modo sin clave**: sin `MEROVAN_ANTHROPIC_API_KEY` cada agente hace una ejecución de prueba guionizada y gratuita
  que recorre las herramientas reales; lo que crea queda marcado como ejemplo y se borra con un botón.
- **Clave dedicada**: solo `MEROVAN_ANTHROPIC_API_KEY`, nunca una `ANTHROPIC_API_KEY` heredada del sistema.
- **Integraciones externas** (TikTok, Meta, proveedores, correo, reembolsos en Stripe): mientras no estén conectadas, una
  acción aprobada fuera de simulación falla con «Integración no conectada» y se hace a mano.
