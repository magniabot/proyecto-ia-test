# Meta Ads Copy CSV — Column Reference

Output format for `/meta-ads-copy`. One row per ad variant. Opens in Excel / Google Sheets.

**IMPORTANT: Always read `meta-copy-template.csv` in this folder and use it as the base for generating the CSV.**

---

## Column Order (13 columns)

```
Variante,Angulo,Audiencia,Headline,Chars_Headline,Primary_Text,Hook_125,Chars_Hook,Description,Chars_Description,CTA,Combinacion,Notas
```

---

## Column Specifications

| Columna | Requerida | Descripción | Ejemplo |
|---------|-----------|-------------|---------|
| `Variante` | Sí | Número de variante (1–N) | `1` |
| `Angulo` | Sí | Ángulo estratégico | `Problem / Pain` |
| `Audiencia` | Sí | Temperatura de audiencia | `Cold` / `Warm` / `Hot` / `Warm / Hot` |
| `Headline` | Sí | Titular del anuncio. **≤ 40 chars** | `Trabajas duro. Mereces esto.` |
| `Chars_Headline` | Sí | Conteo de caracteres del headline | `28` |
| `Primary_Text` | Sí | Texto principal completo | `Turnos largos...` |
| `Hook_125` | Sí | Primeros 125 chars del Primary Text (lo que muestra Meta antes de "Ver más") | `Turnos largos...` |
| `Chars_Hook` | Sí | Conteo de chars del hook. Debe ser ≤ 125 | `111` |
| `Description` | Sí | Descripción. **≤ 30 chars** | `Solo 9 parcelas disponibles` |
| `Chars_Description` | Sí | Conteo de chars de la descripción | `27` |
| `CTA` | Sí | Llamada a la acción (texto del botón) | `Agenda tu visita` |
| `Combinacion` | No | Combinación recomendada si aplica | `Set A — Cold` |
| `Notas` | No | Advertencias o flags de calidad | `⚠️ Verificar disponibilidad` |

---

## Límites de caracteres Meta Ads

| Elemento | Límite | Nota |
|----------|--------|------|
| Headline | 40 chars | Puede truncarse a 27 chars en algunos placements — front-load el mensaje |
| Primary Text (hook) | 125 chars | Meta muestra hasta 125 chars antes de "Ver más" en el feed |
| Description | 30 chars | Frecuentemente oculta en mobile — tratar como refuerzo |

---

## Reglas de validación

1. `Chars_Headline` ≤ 40 — hard limit de Meta
2. `Chars_Hook` ≤ 125 — hook debe funcionar solo dentro de este límite
3. `Chars_Description` ≤ 30 — hard limit de Meta
4. `Headline` — evitar iniciar con el nombre de marca
5. `Primary_Text` — no iniciar con el nombre de marca
6. Sin emojis a menos que el `brand.md` los use explícitamente
7. No repetir el mismo argumento central en dos variantes

---

## Caracteres especiales

| Caracter | Manejo |
|----------|--------|
| Coma (,) | Envolver campo en comillas dobles |
| Comilla (") | Escapar como `""` |
| Salto de línea | Envolver campo en comillas; usar `\n` solo si el campo completo está entre comillas |
| $, %, ° | Permitidos sin escape |
| Guión largo (—) | Permitido |

---

## Ejemplo de fila

```csv
1,Problem / Pain,Cold,"Trabajas duro. Mereces esto.",28,"Turnos largos, entornos áridos, y todo es trabajo — sin un espacio que sea tuyo. Vista los Naranjos cambia eso: 5.000m² propios en el Valle del Elqui, a 20 min de La Serena. Comunidad de solo 10 propietarios, plataformas listas para construir desde el día 1. Agenda tu visita.","Turnos largos, entornos áridos, y todo es trabajo — sin un espacio que sea tuyo. Vista los Naranjos cambia eso:",111,"Solo 9 parcelas disponibles",27,Agenda tu visita,Set A — Cold,
```
