---
name: email-nurture
description: |
  Generate GHL-compatible HTML email sequences and individual emails for real estate nurturing.
  Covers SOS (Soap Opera Sequence), Seinfeld emails, 9-Word win-backs, and long-term editorial nurture.
  AUTO-ACTIVATE for: "crear email", "email de nurturing", "secuencia de emails", "email inmobiliario",
  "email de bienvenida", "soap opera sequence", "email sequence", "email reactivador", "email para leads".
  Also triggered by /email-nurture command.
---

# Email Nurture Skill

Generate GHL-compatible HTML emails for real estate nurturing sequences — primarily text-based, table-structured, mobile-responsive, ready to paste directly into Go High Level's Code Editor.

Built on four integrated frameworks: **SOS (Soap Opera Sequence)**, **Seinfeld Email**, **9-Word Email**, and **Lifecycle Nurture Architecture**.

## Command Format

```
/email-nurture [--single | --sequence]
```

**Examples:**
- `/email-nurture` — Interactive mode, asks single or full sequence
- `/email-nurture --single` — Jump to single email generation
- `/email-nurture --sequence` — Jump to full sequence generation

---

## Phase 0: Mode + Prerequisites

### 0.1 Check for existing brand context

Check if `context/brand.md` exists in the current directory.

| File | If Found | If Missing |
|------|----------|------------|
| `context/brand.md` | Pre-fill brand inputs in Phase 1 and confirm with user | Gather all brand inputs from scratch in Phase 1 |

### 0.2 Mode Selection

If no flag provided, ask via AskUserQuestion:

**Question:** "¿Qué quieres generar?"

| Option | Description |
|--------|-------------|
| Un email individual | Generar un email HTML puntual (un reactivador, un insight, un SOS específico) |
| Una secuencia completa | Generar todos los emails de una fase numerados en carpeta |

---

## Phase 1: Brand / Project Context

Gather project-specific inputs. These are **always required** since this skill is reusable across clients and projects.

**If `context/brand.md` exists:** Pre-fill available fields and confirm. Only ask for what's missing.

**If `context/brand.md` does not exist:** Ask all questions.

Ask in one batch using AskUserQuestion (free text for each):

### 1.1 Brand inputs (ask all at once or confirm from brand.md)

| Input | Question | Example |
|-------|----------|---------|
| Company/brand name | "Nombre de la empresa o marca" | Samay, Inversiones XYZ |
| Project name (optional) | "Nombre del proyecto o desarrollo (dejar vacío si es secuencia general)" | Matanzas Bay, Torres del Valle |
| Location/zone | "Zona o ciudad del proyecto" | Matanzas, Santiago, Medellín |
| Sender name | "Nombre del remitente (quien firma el email)" | Gonzalo |
| Sender title | "Cargo del remitente" | Director Comercial |
| Primary CTA URL | "URL principal a donde apuntan los CTAs" | https://samay.cl/matanzas |
| Value differentiator | "En una oración: ¿qué hace único a este proyecto o empresa?" | Primera inmobiliaria 100% digital con simulador de retorno en tiempo real |

### 1.2 Tone of voice

**Question:** "¿Cuál es el tono de comunicación?"

| Option | Description |
|--------|-------------|
| Cercano y conversacional | Primera persona, como hablarle a un amigo inteligente. Perfecto para SOS y Seinfeld |
| Premium y aspiracional | Sofisticado, sin ser frío. Para proyectos de lujo o inversores de alto patrimonio |
| Educativo y analítico | Datos, razonamiento, proyecciones. Para inversores con perfil más técnico/financiero |
| Formal y profesional | Corporativo, sin ser rígido. Para proyectos B2B o institucionales |

---

## Phase 2: Segment Definition

**Question:** "Describe el segmento de leads al que va dirigido este email o secuencia."

This is a **free-text input**. No fixed options — the user defines any segment they need.

Ask:
```
¿A qué tipo de lead va dirigido?

Describe brevemente:
- Su perfil (ej: inversor con capital disponible, familia comprando primera vivienda)
- Su motivación principal (ej: generar renta pasiva, proteger su patrimonio)
- Su mayor fricción o duda (ej: desconfía del retorno prometido, no sabe si puede financiar)

Puedes ser tan específico como necesites. El skill adaptará el copy a este perfil exacto.
```

Use AskUserQuestion as a free-text question.

**After receiving the segment description, extract and hold in memory:**
- Profile: who they are
- Main motivation: what they want
- Main friction: what blocks them
- Implied pain points: surface 2-3 from the description

---

## Phase 3: Email Configuration

### If single email mode:

**Question:** "¿Qué tipo de email quieres generar?"

Present grouped options:

**Fase 1 — SOS (Soap Opera Sequence):**
| Option | Description |
|--------|-------------|
| SOS #1 — Set the Stage | Email de bienvenida. Promesa de valor + preview de lo que viene |
| SOS #2 — High Drama | Historia con backstory, conflicto relatable, cliffhanger |
| SOS #3 — Epifanía | Resolución del drama + la revelación clave que cambia la perspectiva |
| SOS #4 — Beneficio oculto | El ángulo que el lead no estaba considerando. Reencuadre |
| SOS #5 — Urgencia suave + CTA | Cierre de la fase SOS con próximo paso natural |

**Fase 2 y 3 — Nurturing:**
| Option | Description |
|--------|-------------|
| Insight de mercado | Tesis de inversión, datos, proyecciones. Posiciona al sender como experto |
| Mito + desmontaje | Un mito común del mercado que el lead cree, desarmado con lógica |
| Error común | El error más costoso que cometen los leads de este segmento |
| Behind-the-scenes | Historia interna del proyecto o del equipo. Humaniza la marca |
| Mini-caso financiero | Simulación numérica real (retorno, cuotas, plusvalía). Educa + convierte |
| Q&A del equipo | Respuesta a una pregunta frecuente del segmento. Formato conversacional |
| Guía de zona | Por qué esta ubicación en específico. Data + narrativa |
| Prueba social / testimonio | Historia de un comprador real (o compuesta) con resultado específico |
| Newsletter de mercado | Resumen mensual del mercado inmobiliario. Top-of-mind editorial |

**Reactivación:**
| Option | Description |
|--------|-------------|
| 9-Word Email | Email win-back minimalista. Una sola pregunta de 9 palabras |
| Email breakup | Último intento antes de lista fría. Honesto, sin presión |

Ask with multiSelect: false.

Then ask:

**Question:** "¿Cuál es el número de este email en la secuencia? (dejar vacío si es un email suelto)"

Free text, optional.

---

### If sequence mode:

**Question:** "¿Qué fase o secuencia completa quieres generar?"

| Option | Description |
|--------|-------------|
| Fase 1 — SOS completo (5 emails) | Los 5 emails de onboarding. Para leads recién captados. Base de toda secuencia |
| Fase 2 — Nurture de consolidación (10 emails) | Educación, confianza y objeciones. 10 emails para 60-90 días |
| Fase 3 — Editorial evergreen (6 emails) | Long-term top-of-mind. Baja frecuencia, alto valor editorial |
| Secuencia de reactivación (3 emails) | Win-back para leads dormidos. 9-Word + seguimiento + breakup |
| Secuencia completa (SOS + Nurture + Reactivación) | Todo el programa. ~18 emails |

Read `reference/sequence-architecture.md` to define the exact email list, timing, and type for the selected phase.

Present the proposed email list for confirmation:

```markdown
## Secuencia propuesta: {Fase}

| # | Tipo | Asunto tentativo | Timing |
|---|------|-----------------|--------|
| 01 | SOS #1 — Set the Stage | [...]  | Día 0 (inmediato) |
| 02 | SOS #2 — High Drama | [...] | Día 2 |
| ... | ... | ... | ... |

¿Procedemos con esta estructura o quieres ajustar algún email?
```

---

## Phase 4: Copy Generation

### 4.1 Read references

Read:
- `reference/frameworks.md` — For the framework being applied
- `reference/email-types.md` — For the specific email type formula

### 4.2 Draft the copy

Using:
- The email type formula from `reference/email-types.md`
- The brand context from Phase 1
- The segment profile from Phase 2
- The tone of voice from Phase 1

**Write:**
1. **Subject line:** 3 options (A/B/C). Formulas from `reference/email-types.md`.
2. **Preview text / preheader:** 1 option, max 90 characters.
3. **Greeting:** Personalized with `{{contact.first_name}}`.
4. **Body copy:** Full email text following the type formula.
5. **CTA:** Text + URL from Phase 1. Calibrate commitment level to email type.
6. **Signature:** From brand inputs (Sender name + title + company).

### 4.3 Copy guidelines

- **Write like a human, not a brand.** The sender is a person, not a company.
- **One idea per email.** No multi-topic emails.
- **Short paragraphs.** Max 3 lines per paragraph. Line breaks between every paragraph.
- **Conversational rhythm.** Vary sentence length. Use fragments occasionally.
- **Segment-first.** Open on the lead's world, not on the project.
- **CTAs match commitment level.** SOS #1 → "respóndeme este email". SOS #5 → "agenda una llamada". Nurture → "mira este simulador". Win-back → no CTA or single question.
- **No corporate speak.** No "estimado cliente", no "nos complace informarle".
- **Placeholders:** Use `{{contact.first_name}}`, `{{contact.city}}`, etc. where natural. Mark custom field placeholders as `{{custom.segmento_interes}}` with a note.
- **Images:** When the email type calls for one, include a placeholder: `[IMAGEN: descripción de qué mostrar]`.

### 4.4 Present copy draft

```markdown
## Borrador de Copy — {Email type} #{number}

**Asuntos (elige uno o combina):**
- A: {subject A}
- B: {subject B}
- C: {subject C}

**Preview text:** {preheader}

---

Hola {{contact.first_name}},

{full email body}

{CTA}

{Signature}

---

¿Aprobamos este copy o ajustamos algo antes de generar el HTML?
```

Use AskUserQuestion:
| Option | Description |
|--------|-------------|
| Sí, generar HTML | Proceder con este copy |
| Ajustar copy | Indicar qué cambiar |

---

## Phase 5: HTML Generation

### 5.1 Read HTML template

Read `reference/html-template.md` for the base table structure, inline styles, and section snippets.

### 5.2 Build the HTML

1. Use the approved copy from Phase 4
2. Build using the base structure from `reference/html-template.md`:
   - XHTML Transitional doctype (maximum email client compatibility)
   - Full `<table>`-based layout (no divs for layout)
   - All styles **inline** on every element
   - Max-width 600px container table
   - `width="100%"` on outer wrapper
3. Include the metadata comment block at the very top of the `<body>` (before any visible content)
4. Integrate GHL placeholders where natural
5. If email type calls for an image: include the image row using the image block snippet from the template, with a descriptive alt text and placeholder notation
6. For CTAs: use the button snippet (table-based button for Outlook compatibility)

### 5.3 Metadata comment block

Insert at the top of `<body>`, before any visible HTML:

```html
<!--
  EMAIL METADATA
  ==============
  Número:       {# in sequence, or "individual"}
  Fase:         {SOS Fase 1 / Nurturing Fase 2 / Largo Plazo Fase 3 / Reactivación}
  Tipo:         {Email type name}
  Segmento:     {Segment name as provided by user}
  Framework:    {SOS #X / Seinfeld / 9-Word / Lifecycle Nurture}

  ASUNTO (usar uno):
  A: {subject A}
  B: {subject B}
  C: {subject C}

  PREVIEW TEXT: {preheader}

  TIMING:       {Día X / Semana X / Mes X}
  TRIGGER:      {Inmediato tras opt-in / 48h sin apertura / etc.}

  NOTAS GHL:
  - Pegar en: Marketing > Email Builder > Code Editor
  - Placeholders activos: {{contact.first_name}}, {{contact.city}}
  - Custom fields usados: {list any custom fields, or "ninguno"}
-->
```

### 5.4 Output rules

- **Self-contained:** Every HTML file is complete and copy-pasteable into GHL Code Editor
- **No external CSS files** — all styles inline
- **No JavaScript**
- **Table-based layout** for all structural elements
- **Responsive:** Include `@media` query in `<style>` tag for mobile (as fallback for clients that support it, primary is inline)
- **Tested structure:** Follow the proven structure from `reference/html-template.md` exactly
- **Alt text** on all images
- **Unsubscribe placeholder** in footer: `{{unsubscribe_link}}`

### 5.5 Save file

**Single email:**
- Directory: `created/email-sequences/`
- Filename: `{YYYYMMDD}_{type-slug}_{segment-slug}.html`
- Example: `20260317_sos-01-bienvenida_inversor-renta.html`

**Sequence:**
- Directory: `created/email-sequences/{YYYYMMDD}_{sequence-slug}_{segment-slug}/`
- Filenames: `{##}_{type-slug}.html` (zero-padded number)
- Example: `created/email-sequences/20260317_sos-fase1_inversor-plusvalia/01_set-the-stage.html`

---

## Phase 5.5: Upload to GHL (optional)

After generating and saving the HTML file(s), offer to upload directly to the GHL sub-account.

### Cómo funciona el upload (proceso de 2 pasos)

La API de GHL Email Builder requiere dos llamadas para crear un template HTML correcto:

1. **POST** `https://services.leadconnectorhq.com/emails/builder` — crea el template vacío con `type: 'html'`
2. **PATCH** `https://services.leadconnectorhq.com/emails/builder/{id}` — sube el HTML real con `editorType: 'html'` + `editorContent: {html}`

El campo `html` en el POST es ignorado por GHL. El HTML solo se guarda correctamente vía PATCH con `editorContent`.

El subject line se guarda como `subjectLine` (no `subject`) en el PATCH.

El script `upload-to-ghl.js` implementa este proceso de 2 pasos automáticamente.

### 5.5.1 Check prerequisites

El script acepta el `locationId` desde dos fuentes (en orden de prioridad):

1. `config/ads-context.config.json` → campo `ghl.locationId` (si no es el placeholder)
2. `config/.env` → variable `GHL_LOCATION_ID` (fallback automático)

Si se encuentra en `.env` pero no en config, el script auto-popula `ads-context.config.json`.

Verificar que `config/.env` tenga:
- `GHL_IDENTIFICADOR_SECRETO` — Private Integration Token (Settings > Integrations > API Keys)
- `GHL_LOCATION_ID` — ID de la sub-cuenta (visible en la URL: `app.gohighlevel.com/location/{id}/...`)

Si ambas están ausentes, skip a Phase 6 con instrucciones manuales.

### 5.5.2 Ask the user

**Question:** "¿Subo el template directamente a GHL ahora?"

| Option | Description |
|--------|-------------|
| Sí, subir a GHL | Ejecutar el script de upload para cada email generado |
| No, lo subo manualmente | Saltar al resumen con instrucciones manuales |

### 5.5.3 Install dependencies (first run only)

Check if `node_modules` exists in `.claude/skills/email-nurture/scripts/`. If not:

```bash
cd .claude/skills/email-nurture/scripts && npm install
```

### 5.5.4 Dry run first

Before the real upload, run with `--dry-run` to validate:

```bash
node .claude/skills/email-nurture/scripts/upload-to-ghl.js \
  --file="{OUTPUT_FILE_PATH}" \
  --name="{TEMPLATE_NAME}" \
  --subject="{SUBJECT_A}" \
  --dry-run
```

**Template naming convention:** `{Email#} — {Type} | {Segment}`
Example: `SOS #1 — Bienvenida | Inversor Renta`

Show the dry run output to the user and confirm before proceeding.

### 5.5.5 Real upload

```bash
node .claude/skills/email-nurture/scripts/upload-to-ghl.js \
  --file="{OUTPUT_FILE_PATH}" \
  --name="{TEMPLATE_NAME}" \
  --subject="{SUBJECT_A}"
```

**For sequences:** Run the upload command for each HTML file. Run them sequentially (not in parallel) to avoid rate limiting.

### 5.5.6 Handle upload result

**On success:** Log the Template ID returned by GHL. Include in the Phase 6 summary. El template queda visible en **Marketing > Emails > Templates** con el nombre y HTML correctos.

**On error 401:**
```
El token GHL_IDENTIFICADOR_SECRETO no es válido o expiró.
Regenerar en GHL: Settings > Integrations > API Keys.
```

**On error 403:**
```
El token no tiene permisos de Email Builder.
En GHL: Settings > Integrations > API Keys > tu token > verificar scopes habilitados.
```

**On error 422 (invalid type):**
```
El campo 'type' en el POST debe ser exactamente: html, folder, import, builder, blank o ai_template.
El script usa 'html' — verificar que no haya sido modificado.
```

---

## Phase 6: Output Summary

### Single email:

```markdown
## Email Generado

**Tipo:** {email type}
**Segmento:** {segment}
**Proyecto:** {project name}
**Output:** created/email-sequences/{filename}.html

### Asuntos sugeridos
- A: {subject A}
- B: {subject B}
- C: {subject C}

### Cómo subir a GHL
1. Ve a **Marketing > Emails > Templates** (o Email Builder)
2. Crea un nuevo template → **Blank** → **Code Editor**
3. Pega el HTML completo
4. Guarda como: "{tipo} — {segmento}"
5. Úsalo en tu workflow de automatización

### Placeholders activos
- `{{contact.first_name}}` — asegúrate de que tus contactos tienen este campo
- {any others used}

### Próximo email sugerido
{Next logical email in sequence, with the command to generate it}
```

### Full sequence:

```markdown
## Secuencia Generada

**Fase:** {phase name}
**Segmento:** {segment}
**Carpeta:** created/email-sequences/{folder-name}/

### Emails generados

| # | Archivo | Tipo | Timing | Asunto recomendado |
|---|---------|------|--------|-------------------|
| 01 | 01_set-the-stage.html | SOS #1 | Día 0 | {subject A} |
| 02 | 02_high-drama.html | SOS #2 | Día 2 | {subject A} |
| ... | ... | ... | ... | ... |

### Cómo cargar la secuencia en GHL
1. Sube cada HTML como template individual en Marketing > Emails > Templates
2. Nombra cada template con el número y tipo: "01 — Bienvenida SOS"
3. En Automations, crea un workflow y agrega los emails en orden
4. Configura los tiempos de espera según la columna "Timing"
5. Activa el trigger (ej: Tag agregado, Form submitted)

### Siguiente paso sugerido
{Next phase or win-back sequence recommendation}
```

---

## Error Handling

| Error | Message |
|-------|---------|
| Brand context incomplete | "Necesito el nombre del proyecto, URL del CTA y nombre del remitente para generar el email." |
| Segment description too vague | "Describí el segmento con más detalle: ¿qué motivación tiene y cuál es su mayor fricción o duda?" |
| Email type + tone mismatch | Warn the user and suggest the better-fitting tone for the selected type |

---

## Integration Points

### Uses (reads from):
- `context/brand.md` (optional, if exists) — Pre-fill brand context
- `context/offer-angles.md` (optional, if exists) — Pull value angles and pain points
- `reference/frameworks.md` — Copy framework logic per email type
- `reference/email-types.md` — Formula, structure, subject line patterns per type
- `reference/html-template.md` — GHL-compatible HTML base + section snippets
- `reference/sequence-architecture.md` — Sequence phases, timing, email order

### Produces (writes to):
- `created/email-sequences/{filename}.html` — Single email
- `created/email-sequences/{folder}/{##}_{type}.html` — Sequence

### Downstream:
- Copy-paste into GHL Code Editor
- Load into GHL Automation workflows
- A/B test subject lines using GHL's split testing
