---
tipo: guia
id: INI-GUIA
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Guía de la bóveda

En una frase: cómo funciona esta bóveda, escrita para alguien que nunca ha usado Obsidian.

## 1. Qué es esto
Obsidian es un editor de notas en Markdown: cada nota es un archivo `.md` dentro de esta carpeta. Las notas se enlazan entre sí escribiendo `[[Nombre de la nota]]`.

- **La app de MEROVAN (backoffice)** es la fuente de verdad de los **números**: métricas, costes, pedidos.
- **Esta bóveda** es la fuente de verdad del **conocimiento**: por qué decidimos algo, cómo se hacen las cosas, qué aprendimos.

No copies aquí datos que cambian cada día; la app exporta resúmenes automáticamente.

## 2. Dónde va cada cosa
| Quiero guardar… | Carpeta | Plantilla |
|---|---|---|
| Una idea de producto | `02-PRODUCTOS/01-Ideas-y-candidatos` | Producto |
| Un proveedor | `03-PROVEEDORES` | Proveedor |
| Una muestra recibida | `03-PROVEEDORES` | Muestra |
| Un vídeo o imagen de anuncio | `04-MARKETING/Creatividades` | Creatividad |
| Un guion | `04-MARKETING/Guiones` | Guion |
| Una campaña | `04-MARKETING/Campanas` | Campaña |
| Un procedimiento paso a paso | `06-OPERACIONES` | SOP |
| Una decisión importante | `01-ESTRATEGIA` | ADR |
| Acta de reunión | `09-EQUIPO/Reuniones` | Reunión |
| Lo que hice hoy | `09-EQUIPO/Diario` | Nota diaria |
| No sé dónde va | [[Bandeja de entrada]] | — |

## 3. Cómo crear una nota nueva
1. En el panel izquierdo, clic derecho en la carpeta correcta → **Nueva nota**.
2. Ponle el nombre con su ID (ver [[Convenciones]]), p. ej. `PRD-0002 Lámpara de lectura`.
3. Paleta de comandos (`Ctrl+P`) → **Plantillas: insertar plantilla** → elige la plantilla.
4. Rellena el frontmatter (la cabecera entre `---`) y la línea "En una frase".
5. Enlaza la nota desde otra (producto ↔ proveedor ↔ creatividad…).

## 4. Productos: el embudo
La subcarpeta de `02-PRODUCTOS` indica la **fase**; el campo `estado` del frontmatter indica el **estado exacto**.

| Subcarpeta | Estados |
|---|---|
| `01-Ideas-y-candidatos` | idea, candidato |
| `02-En-validacion` | validando-proveedor, muestra-pedida, muestra-aprobada, listo-para-publicar |
| `03-En-test` | en-test, pausado |
| `04-Escalando` | escalando |
| `05-Descartados` | descartado |

Un producto descartado **se mueve, nunca se borra**: su nota guarda el motivo y lo aprendido.

## 5. Notas generadas por la app
Algunas notas tienen zonas automáticas:
```
<!-- merovan:auto:start -->
… esto lo regenera la app …
<!-- merovan:auto:end -->
```
Puedes escribir **fuera** de los marcadores con total libertad: la app nunca lo toca. Lo que escribas **dentro** se sobrescribirá en la siguiente exportación.

## 6. Plugins
Funciona sin instalar nada: usa plugins del núcleo (Plantillas, Notas diarias, Canvas, Propiedades, **Bases**).

Recomendados (opcionales, se activan en Ajustes → Plugins de comunidad):
- **Dataview**: consultas alternativas en el [[Cuadro de mando]].
- **Templater**: plantillas con fecha automática y más lógica.
- **Tasks**: tareas con fecha de vencimiento.
- **Kanban**: ver el embudo de productos como tablero.
- **Calendar**: navegar las notas diarias.
- Opcional: **Excalidraw**, **Obsidian Git**.

Usamos **plantillas nativas** por defecto para que nadie dependa de un plugin para crear notas.

## 7. Reglas de orden
- Una sola ubicación correcta por tipo de nota.
- Ninguna nota huérfana: enlázala desde su `_Índice` o desde otra nota.
- Antes de renombrar o mover, deja que Obsidian actualice los enlaces (Ajustes → Archivos y enlaces → actualizar enlaces automáticamente).
- La carpeta `_sistema/` es el código de la app: está oculta de búsquedas y grafo. No guardes notas ahí.
- **Nunca** guardes contraseñas, tokens ni datos personales de clientes en la bóveda.
