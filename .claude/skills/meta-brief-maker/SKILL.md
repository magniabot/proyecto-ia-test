---
name: meta-brief-maker
description: |
  Generate a complete Meta Ads creative brief from context + structured interview.
  AUTO-ACTIVATE for: "crear brief", "brief creativo", "brief meta", "brief para diseñador",
  "brief de anuncios", "brief meta ads", "preparar brief", "brief creativo meta".
  Also triggered by /meta-brief command.
---

# Meta Brief Maker

Generate a complete Meta Ads creative brief from business context, offer angles, and a structured interview. Output is a print-ready HTML file (open in browser → Ctrl+P → Save as PDF) plus an Asana task assigned to the designer/editor.

## Command Format

```
/meta-brief
```

---

## Phase 0: Load Context

Read ALL of the following before starting the interview:

1. `context/business.md` — project details, ICP, budget, constraints
2. `context/offer-angles.md` — hooks, angles, headlines, validations
3. `context/brand.md` — tone, CTAs, visual identity, example phrases
4. `context/brand-colours/palette.md` — brand colors for brief styling

**If `context/offer-angles.md` is missing or has fewer than 3 angles populated:**
> "No encontré ángulos de oferta completos en `context/offer-angles.md`. Corre `/offer-angles` primero para extraer los hooks antes de crear el brief."
Stop.

**If `context/business.md` is missing:**
> "No encontré contexto de negocio. Corre `/business-context` primero."
Stop.

---

## Phase 1: Interview

Present ALL questions in a single message. Do NOT ask one question at a time.

Before listing questions, show the user the available hooks extracted from `context/offer-angles.md`, grouped by angle type, so they can reference them in Q4.

Format the interview block as follows:

---

> **Antes de generar el brief, necesito algunos datos específicos para esta tanda:**
>
> *Hooks disponibles de tu estrategia de oferta:*
> [List all headline-ready phrases from offer-angles.md, grouped by angle — e.g., "**Dolor:** Trabajas duro. Mereces esto. / Escapa del ritmo minero | **USP:** Solo 10 propietarios / Vista privilegiada al Elqui | etc."]
>
> ---
>
> **1. Campaña objetivo**
> ¿Esta tanda es para:
> - (A) Captación — público frío, primera vez que ve el proyecto
> - (B) Retargeting — ya vio el proyecto, no convirtió
> - (C) Ambas — variantes diferenciadas para cada objetivo
>
> **2. Material visual disponible**
> ¿Qué material tienes hoy para producir estas piezas? (marca todo lo que aplique):
> - [ ] Video drone del proyecto
> - [ ] Video recorrido / tour del terreno
> - [ ] Fotos reales del proyecto (exteriores, terrenos, vistas)
> - [ ] Renders de alta calidad
> - [ ] Logo y brandbook
> - [ ] Testimonios en video de compradores
> - [ ] Otro: ___
>
> **3. Cantidad de piezas**
> ¿Cuántas piezas quieres producir en esta tanda?
> (Recomendado: 3–5 para Meta. Mínimo 1 video si hay material, el resto imágenes.)
>
> **4. Ángulos / Hooks a priorizar**
> Basándote en los hooks listados arriba, ¿cuáles quieres priorizar para esta tanda?
> Puedes indicar por nombre o tipo de ángulo. Si no seleccionas, usaré los de mayor prioridad según el objetivo (captación → dolor + propuesta de valor; retargeting → urgencia + prueba social).
>
> **5. Plataformas**
> ¿Las piezas son solo para Meta Ads, o también para Google Ads Display?
> - (A) Solo Meta Ads
> - (B) Meta Ads + Google Ads Display (se agregan dimensiones extra al brief)
>
> **6. Plazo de entrega**
> ¿Para qué fecha necesitas que el diseñador/editor entregue las piezas producidas?
>
> **7. Tipo de proyecto en Asana**
> ¿Es un proyecto de:
> - (A) Entrega de Servicio
> - (B) Servicio Recurrente Mensual
>
> **8. Asignado a**
> ¿A quién asigno la tarea en Asana? (nombre del diseñador o editor de video)

---

Wait for user response before proceeding.

---

## Phase 2: Generate Brief Content

### 2.1 Build Matriz 5x5

Using data from `context/offer-angles.md` (pain points, aspiraciones) and `context/business.md` (USPs, value boosters), build a 5×5 matrix:

- **Rows (Eje Y):** Top 5 pain points OR aspiraciones del ICP (from offer-angles.md Problem/Pain + context from brand.md Target Audience)
- **Columns (Eje X):** Top 5 atributos diferenciadores del proyecto (from offer-angles.md USPs + Value Boosters)

For each cell, generate a short creative idea (1 sentence) combining that pain/aspiration with that attribute.

Select the N strongest combinations where N = pieces requested (interview Q3). Prioritize combinations that:
- Use the hooks selected by user (interview Q4), or if none selected, highest-priority hooks per temperature
- Are not redundant with each other (different emotional angle per piece)
- Match available material (interview Q2) — e.g., don't build a video-heavy concept if only renders are available

### 2.2 Define Format Mix

Based on available material (interview Q2):

| Material disponible | Mix recomendado |
|---|---|
| Video + fotos + renders | 1–2 videos (Feed 4:5 + Stories 9:16) + 1–2 imágenes estáticas + 1 carrusel opcional |
| Solo fotos + renders (sin video) | 2–3 imágenes estáticas (Feed 4:5) + 1 carrusel |
| Solo renders (sin fotos reales) | 2–3 imágenes estáticas. Nota en brief: "Reemplazar renders con fotos reales en cuanto estén disponibles" |
| Solo logo (sin material visual) | Detener brief. Alertar: "No hay suficiente material visual para producir. Esperar fotos o renders." |

### 2.3 Develop Each Piece

For each of the N pieces, generate the following using the CCC Framework (see `references/ccc-framework.md`):

**Hook + CCC:**
```
Hook: [frase principal del hook]
- Curiosidad: [qué detiene el scroll — pregunta, afirmación provocadora, dato sorprendente]
- Contexto: [cómo el ICP se identifica — visual, mención directa, situación reconocible]
- Claridad: [qué esperar del anuncio — la promesa o tipo de contenido]
```

**Copy del anuncio:**
- **Primary text:** Max 125 caracteres visibles (hasta 500 total). Tono desde `context/brand.md`.
  - Para captación: abre con el hook de dolor o aspiración, desarrolla el beneficio, cierra con urgencia/escasez.
  - Para retargeting: abre con urgencia/escasez real, refuerza el USP diferenciador, CTA directo.
- **Titular (headline):** Max 40 caracteres. Beneficio directo, no genérico.
- **Descripción:** Max 30 caracteres. Complementa el titular.
- **CTA:** Seleccionar del brand CTAs de `context/brand.md`. Default: "Más información"

**Indicaciones visuales:**
- Qué material usar (de los disponibles en Q2)
- Composición: qué debe verse primero, dónde va el texto overlay
- Paleta: referenciar colores de `context/brand-colours/palette.md`
- Logo: posición sugerida (ej. esquina inferior derecha, tamaño discreto)
- Si es video: duración, ritmo, texto overlay por segundo (ej. "0–2s: hook en pantalla / 2–10s: toma drone / 10–25s: atributos como texto / 25–30s: CTA + logo")

**Dimensiones:** Ver `references/meta-dimensions.md`. Asignar dimensiones por formato y plataforma seleccionada (Q5).

### 2.4 Validate Against Constraints

Before finalizing, cross-check every piece against `context/business.md` Known Constraints:
- No mencionar precios del proyecto anterior
- No comunicar energía eléctrica como disponible ahora (proyectada a 1 año)
- Urgencia con números reales (9 disponibles, no genérico)
- Material visual nuevo pendiente: si el usuario marcó que no tiene fotos reales, incluir nota en el brief indicando qué material reemplazará los renders cuando esté disponible

---

## Phase 3: Generate HTML Brief

Using `references/brief-html-template.html` as structural guide, generate a complete, self-contained HTML file.

**Sections to include:**
1. **Portada** — Nombre del proyecto, fecha, cantidad de piezas, objetivo de campaña
2. **Resumen ejecutivo** — Tono comunicacional (from brand.md), material disponible, plataformas, fecha de entrega
3. **Matriz 5×5** — Tabla completa generada en Phase 2.1
4. **Brief por pieza** — One full section per piece with all fields from Phase 2.3
5. **Especificaciones técnicas** — Dimensions table from meta-dimensions.md for the formats included

**Styling:**
- Use brand colors from `context/brand-colours/palette.md` for accents (section headers, borders, badges)
- Clean, professional typography — readable on screen and printed
- Print CSS: @media print — page breaks between cover and each piece, A4 format

**Save to:** `created/meta-briefs/YYYYMMDD_[client-slug]_meta-brief.html`

Client slug = short identifier from project name (e.g., Vista los Naranjos → `vln`, Parcelas El Qui → `peq`).

**Example filename:** `20260310_vln_meta-brief.html`

Create `created/meta-briefs/` directory if it doesn't exist.

---

## Phase 4: Create Asana Task

### 4.1 Find Asana Project

Determine target project name from interview Q7:
- Entrega de Servicio → "[Client Name] Entrega Servicio"
- Servicio Recurrente Mensual → "[Client Name] Servicio Recurrente Mensual"

Client name = company name from `context/brand.md` or project name from `context/business.md`.

Search using `mcp__claude_ai_Asana__search_objects` with the project name.

**If project not found:**
> "No encontré el proyecto '[nombre]' en Asana. ¿El nombre es diferente, o quieres que lo cree?"
Wait for user response. Do not create a project without explicit confirmation.

### 4.2 Find Assignee

Use `mcp__claude_ai_Asana__get_workspace_users` to find the user by name from interview Q8.

**If user not found:**
> "No encontré a '[nombre]' en los usuarios del workspace de Asana. ¿Puedes confirmar el nombre completo o email?"

### 4.3 Create Task

Call `mcp__claude_ai_Asana__create_task_preview` then `mcp__claude_ai_Asana__create_task_confirm` with:

- **Name:** `Brief Creativo Meta Ads — [Project Name] — [YYYY-MM-DD]`
- **Description:**
  ```
  Brief creativo generado para Meta Ads.

  📄 Brief completo: created/meta-briefs/[filename].html
  (Abrir en browser → Ctrl+P → Guardar como PDF para compartir)

  🎯 Objetivo: [captación / retargeting / ambas]
  📦 Piezas: [N] piezas
  🎨 Formatos: [list — e.g., Video 4:5, Imagen 1:1, Carrusel]
  🖼️ Material base: [list of available material]
  📅 Plazo de producción: [delivery date from Q6]

  Revisar el brief completo para indicaciones de copy, CCC, visual y dimensiones por pieza.
  ```
- **Assignee:** user from 4.2
- **Section:** "Implementación de Marketing" if that section exists in the project; otherwise root
- **Due date:** delivery date from interview Q6

---

## Phase 5: Log to Memory

Append to `context/memory/YYYY-MM-DD.md` (create file with `# YYYY-MM-DD` header if it doesn't exist):

```markdown
## Meta Brief Creado
- Brief para [project name]: [N] piezas, objetivo [cold/retargeting/ambas]
- Hooks priorizados: [list]
- Formatos: [list]
- Output: created/meta-briefs/[filename].html
- Tarea Asana: "[task name]" → asignada a [assignee]
```

---

## Phase 6: Present Summary

```
## Brief Creativo Meta Ads — [Project Name] ✅

**Fecha:** [date]
**Objetivo:** [captación / retargeting / ambas]
**Piezas generadas:** [N]

### Piezas incluidas

| # | Hook | Formato | Dimensiones |
|---|------|---------|-------------|
| 1 | [hook text] | [Video/Imagen/Carrusel] | [dims] |
| 2 | [hook text] | [Video/Imagen/Carrusel] | [dims] |
...

### Output

- 📄 **Brief:** `created/meta-briefs/[filename].html`
  → Abre en browser → Ctrl+P → Guardar como PDF
- ✅ **Tarea Asana:** "[task name]" → asignada a [assignee]

### Notas
- [Any constraints flagged — e.g., "Pieza 2 usa renders — reemplazar con fotos reales cuando estén disponibles"]
- [Any material warnings]
```

---

## Error Handling

| Situation | Response |
|---|---|
| `offer-angles.md` missing | "Corre `/offer-angles` primero." Stop. |
| `business.md` missing | "Corre `/business-context` primero." Stop. |
| No visual material available | "Sin material visual no se puede producir. Confirmar con el cliente cuándo estará disponible." |
| Asana project not found | "No encontré '[nombre]'. ¿Nombre exacto o lo creo?" |
| Asana user not found | "No encontré a '[nombre]'. ¿Nombre completo o email?" |
| Constraint violation in copy | Flag specific piece + constraint. Rewrite before outputting. |

---

## Integration Points

### Reads from:
- `context/business.md`
- `context/offer-angles.md`
- `context/brand.md`
- `context/brand-colours/palette.md`
- `.claude/skills/meta-brief-maker/references/ccc-framework.md`
- `.claude/skills/meta-brief-maker/references/meta-dimensions.md`
- `.claude/skills/meta-brief-maker/references/brief-html-template.html`

### Writes to:
- `created/meta-briefs/YYYYMMDD_[client-slug]_meta-brief.html`
- `context/memory/YYYY-MM-DD.md`

### Downstream:
- Diseñador / Editor de video (via Asana task + HTML brief as PDF)
