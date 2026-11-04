---
tipo: guia
id: INI-CONV
estado: activo
responsable: owner
creado: 2026-11-04
actualizado: 2026-11-04
tags: [inicio]
---

# Convenciones

En una frase: las reglas fijas de nombres, IDs, frontmatter, estados y etiquetas de la bóveda.

## 1. Nombres e IDs
El ID es el mismo en la bóveda y en la base de datos de la app.

| Tipo | Formato | Ejemplo |
|---|---|---|
| Producto | `PRD-0001 Nombre` | `PRD-0001 Organizador de cables` |
| Proveedor | `PRV-0001 Nombre` | `PRV-0001 BigBuy` |
| Muestra | `MUE-0001 Producto - Proveedor` | `MUE-0001 Organizador - BigBuy` |
| Creatividad | `CRE-0001 Gancho` | `CRE-0001 Escritorio caótico en 2 s` |
| Guion | `GUI-0001 Producto - Ángulo` | `GUI-0001 Organizador - Antes y después` |
| Campaña | `CAM-0001 Nombre` | `CAM-0001 Test TikTok organizador` |
| Reunión | `REU-AAAA-MM-DD Tema` | `REU-2026-11-04 Arranque` |
| SOP | `SOP-0001 Título` | `SOP-0001 Validar un producto` |
| Decisión | `ADR-0001 Decisión` | `ADR-0001 Tienda web propia` |
| Informe semanal | `REP-AAAA-SNN` | `REP-2026-S45` |
| Informe mensual | `REP-AAAA-MM` | `REP-2026-11` |
| Nota diaria | `AAAA-MM-DD` | `2026-11-04` |

Sin caracteres `? : / \ | * " < >` en los nombres. Números con 4 cifras.

## 2. Frontmatter obligatorio
Toda nota empieza con:
```yaml
---
tipo:          # producto | proveedor | muestra | creatividad | guion | campana | reunion | sop | adr | informe | diaria | semanal | indice | guia
id:
estado:
responsable:   # rol o nombre
creado:        # AAAA-MM-DD
actualizado:   # AAAA-MM-DD
tags: []
---
```
Productos añaden: `nicho`, `canal`, `puntuacion`, `margen_contribucion`, `roas_equilibrio`, `proveedor_principal`, `decision`, `motivo_decision`.

## 3. Estados (listas cerradas)
- **Producto:** `idea`, `candidato`, `validando-proveedor`, `muestra-pedida`, `muestra-aprobada`, `listo-para-publicar`, `en-test`, `escalando`, `pausado`, `descartado`.
- **Decisión de producto:** `escalar`, `arreglar`, `matar`, `esperar`.
- **Proveedor:** `evaluando`, `activo`, `respaldo`, `descartado`.
- **Muestra:** `pedida`, `recibida`, `aprobada`, `rechazada`.
- **Guion:** `borrador`, `revisado`, `aprobado`.
- **Creatividad:** `idea`, `guion`, `grabado`, `editado`, `aprobado`, `publicado`, `retirado`.
- **Campaña:** `borrador`, `pendiente-aprobacion`, `activa`, `pausada`, `finalizada`.
- **SOP / ADR / guía:** `borrador`, `activo`, `obsoleto`.
- **Reunión / informe:** `abierto`, `cerrado`.

## 4. Etiquetas (taxonomía cerrada)
Añade una nueva solo si la apuntas antes aquí.
- `#producto/estado/<estado>`
- `#decision/escalar` · `#decision/arreglar` · `#decision/matar` · `#decision/esperar`
- `#canal/web` · `#canal/tiktok-shop` · `#canal/meta` · `#canal/instagram`
- `#legal/riesgo` · `#legal/gpsr` · `#legal/ce`
- `#marketing/ia` (contenido generado con IA) · `#marketing/patrocinado`
- `#ejemplo` (notas de muestra)
- `#inicio`

## 5. Estructura de una nota
1. Frontmatter.
2. Título `# …`.
3. Línea **"En una frase: …"**.
4. Secciones en el orden de la plantilla.
5. Enlaces relacionados al final.

Una idea por nota. Fechas en `AAAA-MM-DD` en el frontmatter; en el texto, `DD/MM/AAAA`. Moneda EUR.
