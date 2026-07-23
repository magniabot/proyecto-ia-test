---
name: meta-bulk-uploader
description: |
  Create Meta Ads campaigns, ad sets, and ads via Marketing API following SOP-027 structure
  (CBO + Control/Test adsets + Broad audience). Two modes: full campaign setup from scratch,
  or upload ads to existing ad sets.
  AUTO-ACTIVATE for: "upload meta ads", "crear campaña meta", "subir anuncios meta",
  "configurar campaña meta", "bulk upload meta", "crear anuncios meta api",
  "setup meta campaign", "launch meta campaign", "lanzar campaña meta".
  Also triggered by /meta-bulk-upload command.
---

# Meta Ads Bulk Uploader

Upload campaigns, ad sets, and ads to Meta Ads via Marketing API, following SOP-027 structure:
CBO campaign → Control adset (active) + Test adset (paused) → ads with UTMs auto-configured.

**Two modes:**
- `full-setup` — Crear campaña nueva desde cero (campaña + adsets + anuncios)
- `ads-only` — Subir anuncios a un adset existente

---

## Command Format

```
/meta-bulk-upload [--mode=<full-setup|ads-only>] [--project <name>]
```

---

## Prerequisites

Before starting, check:

| Requirement | Where to find |
|-------------|---------------|
| `META_ACCESS_TOKEN` | `config/.env` — System User token con permiso `ads_management` |
| `META_AD_ACCOUNT_ID` | `config/.env` — Formato: `act_XXXXXXXXXXXXXXXXX` |
| Facebook Page ID | Ads Manager → Settings → Page, o preguntar al usuario |
| Meta Pixel ID | Ads Manager → Events Manager, o preguntar al usuario |
| Creatives listas | Image hashes de Ads Manager, o rutas de archivos locales |

**If credentials missing:** Show error and stop:
```
Error: Faltan credenciales Meta en config/.env
Agregar: META_ACCESS_TOKEN y META_AD_ACCOUNT_ID
```

---

## Process

### Step 1 — Mode Selection

If mode not specified, ask:

> **¿Qué quieres hacer?**
> 1. **Setup completo** — Crear campaña nueva (CBO) + adsets Control/Test + anuncios
> 2. **Solo anuncios** — Subir anuncios a un adset existente

---

### Step 2 — Load Context

**Always read:**
- `config/ads-context.config.json` → extract `metaAds.adAccountId`, `metaAds.clientName`
- Also check for optional fields: `metaAds.pageId`, `metaAds.pixelId`, `metaAds.instagramAccountId`

**If project-specific work:**
- Determine project (ask if unclear, see CLAUDE.md for project list)
- Read `context/projects/[project]/business.md` → extract conversion goal, budget, target audience
- Read `context/projects/[project]/offer-angles.md` → extract angles and copy

**For ads-only mode, also read:**
- `context/meta-ads/data/adsets.csv` → list active adsets for user selection

---

### Step 3 — Gather Required Information

#### MODE: full-setup

Ask for any information not already available from context files:

**Campaign info — preguntar todo esto:**

| Field | Source | Si falta |
|-------|--------|----------|
| Nombre campaña | Ask user | Required — ask |
| Presupuesto mensual CLP | `business.md` o ask | Required — ask (calcular diario internamente) |
| Bid strategy | Ask | Ver opciones abajo |
| Evento de conversión | `business.md` objective | Ask: Lead o Schedule? |
| URL del funnel | `context/projects/[project]/website/` or ask | Required — ask |

**Bid strategy — preguntar explícitamente:**
> ¿Qué estrategia de puja quieres usar?
> 1. **Lowest Cost sin cap** — Meta optimiza al mínimo costo posible (recomendado para lanzamiento)
> 2. **Cost Cap** — Target de costo por resultado. ¿Cuánto es el máximo CPA aceptable?
> 3. **Bid Cap** — Cap máximo por puja en subasta. ¿Cuál es el cap?

**Ad sets — preguntar explícitamente, NO asumir Control/Test:**
> ¿Cuántos ad sets quieres crear y con qué nombres?
> Ej: "Control + Test", "Broad + LAL 2%", o un solo adset "Lanzamiento"

Para cada ad set definido, asignar un `key` interno (identificador corto: `control`, `test`, `broad`, etc.) que los anuncios usarán para asignarse.

**Adset config (aplica igual a todos los adsets):**
| Field | Source | Si falta |
|-------|--------|----------|
| Pixel ID | `config/ads-context.config.json → metaAds.pixelId` | Ask user |
| Page ID | `config/ads-context.config.json → metaAds.pageId` | Ask user |
| Instagram Account ID | `config/ads-context.config.json → metaAds.instagramAccountId` | Ask — optional |
| País | Default: CL | Ask if not Chile |
| Rango de edad | `business.md` ICP or default 25-65 | Use default, confirm |

**Defaults automáticos (no preguntar):**
- CBO: budget a nivel campaña ✓
- Audiencia: Broad — sin intereses ✓
- Placements: Advantage+ (API default) ✓
- CTA: `LEARN_MORE` ✓
- Todos los adsets y anuncios: PAUSED ✓
- UTMs: template estándar auto-configurado ✓

**Ad creatives — formatos:**

> **Regla de formatos:**
> - **Estático (imagen):** Subir 9:16 Y 4:5 como UN SOLO anuncio (multi-formato). Pedir ambos hashes/paths.
> - **Video:** Solo 9:16. Un video_id por anuncio.

Para cada anuncio recopilar:

| Field | Notes |
|-------|-------|
| Nombre del anuncio | Descriptivo: "Ángulo 1 — Estático" |
| Adset target | key del adset (ej: `control`) |
| Formato | `image` (estático multi-formato) o `video` |
| Creative (imagen) | `image_hashes: [hash_9_16, hash_4_5]` O `image_paths: [ruta_9_16, ruta_4_5]` |
| Creative (video) | `video_id` único (9:16 solamente) |
| Primary text | Desde `offer-angles.md` o copy del usuario |
| Headline | Máx 40 chars |
| Description | Opcional, máx 30 chars |
| CTA | Default: `LEARN_MORE` |

**If user has output from `/meta-ads-copy`:** Read the CSV at `created/projects/[project]/meta-ads/*.csv` and pre-fill primary texts and headlines from it. Ask user to confirm which variants to include.

**Budget calculation helper:**
```
Presupuesto mensual ÷ 30.4 = presupuesto diario (daily_budget_clp)
Ejemplo: $1.000.000/mes ÷ 30.4 = 32.895 → redondear a 33.000/día

IMPORTANTE: daily_budget_clp se envía a la API exactamente como está.
CLP no tiene centavos — NO multiplicar por 100.
```

#### MODE: ads-only

| Field | Source | If missing |
|-------|--------|------------|
| Adset ID | `context/meta-ads/data/adsets.csv` | Show list, ask user to pick |
| Page ID | `config/ads-context.config.json` | Ask user |
| Instagram ID | Config | Ask — optional |
| URL destino | Ask user | Required |
| Ads | Same as above | Collect for each ad |

**If adsets.csv available, show table:**
```
Adsets disponibles:
| ID | Nombre | Campaña | Estado |
|-----|--------|---------|--------|
| 123 | Control | Vista Los Naranjos — Conversiones | ACTIVE |
| 456 | Test    | Vista Los Naranjos — Conversiones | PAUSED |
```

---

### Step 4 — Generate Brief JSON

Once all info is collected, generate the brief JSON file.

**Filename:**
```
context/meta-ads/upload-briefs/YYYYMMDD_[project-slug]_[mode].json
```

Example: `context/meta-ads/upload-briefs/20260323_vista-los-naranjos_full-setup.json`

Create the directory `context/meta-ads/upload-briefs/` if it doesn't exist.

**For full-setup:** Use template from `references/brief-template-full.json`
**For ads-only:** Use template from `references/brief-template-ads-only.json`

**Key rules when generating:**
- Remove all `_note`, `_instructions`, `_*` comment keys from the final JSON
- Calculate `daily_budget_clp` correctly (presupuesto mensual ÷ 30.4, rounded)
- `primary_texts` array → use when there are multiple copy variants for same creative
- `primary_text` string → use when there's only one text for that ad
- Each ad must have either `image_hash` OR `image_path` OR `video_id` — never missing

**Show preview before saving:**

```
## Brief generado — REVISAR ANTES DE SUBIR

**Modo:** full-setup
**Proyecto:** Vista los Naranjos
**Campaña:** Vista los Naranjos — Conversiones
**Presupuesto:** CLP $50.000/día
**Evento conversión:** LEAD
**URL destino:** https://funnel.com/vista-los-naranjos

**Ad Sets:**
| Nombre | Estado | Audiencia |
|--------|--------|-----------|
| Vista los Naranjos — Control | PAUSED (activar tras revisión) | Broad, CL, 25-65 |
| Vista los Naranjos — Test | PAUSED | Broad, CL, 25-65 |

**Anuncios (4 total):**
| Nombre | Adset | Formato | Creative | Primary Text (preview) |
|--------|-------|---------|----------|------------------------|
| Ángulo 1 — Imagen A | control | image | hash: abc123 | "Texto primer anuncio..." |
| Ángulo 1 — Imagen A — v1 | control | image | hash: abc123 | "Variante A..." |
| Ángulo 1 — Imagen A — v2 | control | image | hash: abc123 | "Variante B..." |
| Ángulo 2 — Video | control | video | video_id: xyz | "Texto video..." |

**UTMs:** Configurados automáticamente (template SOP-027)
**Archivo:** context/meta-ads/upload-briefs/20260323_vista-los-naranjos_full-setup.json
```

Ask: **¿Todo correcto? Confirmar para continuar con el dry run.**

---

### Step 5 — Dry Run

Before uploading, run a dry-run to verify the script parses the brief correctly:

```bash
cd [project-root]
node .claude/skills/meta-bulk-uploader/scripts/upload.js \
  --mode=[mode] \
  --input=context/meta-ads/upload-briefs/[filename].json \
  --dry-run
```

**Install deps first if needed:**
```bash
cd .claude/skills/meta-bulk-uploader/scripts && npm install && cd -
```

Show the dry-run output to the user. If there are any errors in the dry run, fix the brief JSON before proceeding.

Ask: **¿Dry run correcto? Confirmar para hacer el upload real.**

---

### Step 6 — Upload

Run the actual upload:

```bash
node .claude/skills/meta-bulk-uploader/scripts/upload.js \
  --mode=[mode] \
  --input=context/meta-ads/upload-briefs/[filename].json
```

Show the terminal output in real time.

---

### Step 7 — Report Results

After upload completes, read the results JSON from `created/meta-ads/TIMESTAMP_upload-results.json` and present:

```markdown
## Meta Ads Upload Complete

**Proyecto:** Vista los Naranjos
**Modo:** Setup completo

### Entidades creadas

| Tipo | Nombre | ID | Estado |
|------|--------|----|--------|
| Campaña | Vista los Naranjos — Conversiones | 123456789 | PAUSED |
| Ad Set Control | Vista los Naranjos — Control | 234567890 | PAUSED |
| Ad Set Test | Vista los Naranjos — Test | 345678901 | PAUSED |
| Anuncio | Ángulo 1 — Imagen A | 456789012 | PAUSED |
| Anuncio | Ángulo 2 — Video — v1 | 567890123 | PAUSED |
| Anuncio | Ángulo 2 — Video — v2 | 678901234 | PAUSED |

**Anuncios OK:** 3
**Errores:** 0

### Próximos pasos (SOP-027 Paso 4-5)

1. Revisar en Ads Manager: campaña, adsets, y anuncios creados
2. Verificar checklist pre-lanzamiento:
   - [ ] Pixel correcto seleccionado
   - [ ] URL destino apunta al funnel de Meta (no Google)
   - [ ] UTMs configurados (verificar en URL Parameters)
   - [ ] CTA "Más información" seleccionado
   - [ ] Fanpage + Instagram vinculados
3. Una vez verificado: **activar el Ad Set Control** (no la campaña completa)
4. Monitorear primeras horas: aprobación de anuncios + impresiones + eventos Pixel

**Resultados guardados:** created/meta-ads/[timestamp]_upload-results.json
```

If there were errors (some ads failed), show them and suggest fixes.

---

### Step 8 — Log to Memory

Log to `context/memory/YYYY-MM-DD.md`:

```markdown
## Meta Ads Upload
- Modo: [full-setup | ads-only]
- Proyecto: [nombre]
- Campaña: [nombre] (ID: [id])
- Adsets: Control (ID: [id]) + Test (ID: [id])
- Anuncios subidos: [n] — ángulos: [lista]
- Brief: context/meta-ads/upload-briefs/[filename].json
- Resultados: created/meta-ads/[filename]-results.json
```

---

## Error Handling

| Error | Causa probable | Solución |
|-------|----------------|----------|
| `Missing credentials` | No hay token en config/.env | Pedir al usuario configurar `.env` |
| `[190] Token invalid` | Token expirado o revocado | Regenerar System User token en Business Manager |
| `[200] Permission denied` | System User sin acceso a la cuenta | Agregar en Business Manager → System Users → Assets |
| `[100] Invalid parameter` | Campo mal formateado en brief | Revisar el JSON, especialmente IDs y arrays |
| `Image file not found` | Ruta de imagen incorrecta | Verificar que `image_path` existe relativo al workspace |
| `No hash returned` | Error al subir imagen | Verificar formato de imagen (JPG/PNG, max 30MB) |
| `Ad set key not found` | `ad.adset` con valor inválido | Usar `control` o `test` (full-setup) |
| Anuncio rechazado (post-upload) | Política de Meta | Revisar en Ads Manager y ajustar copy o creative |

**On partial failure** (some ads created, some failed):
- Show which ads succeeded with their IDs
- Show which ads failed with error messages
- Suggest running ads-only mode to retry only the failed ones

---

## Image Hash — How to Get

Users can provide creatives as:

**Option A — Image hash (pre-uploaded):**
1. Upload image in Ads Manager → Creative Hub or Ad creation flow
2. Go to Ad Account → Media Library
3. Copy the hash

**Option B — Local file path:**
- Place image in workspace (e.g., `context/meta-ads/creatives/imagen.jpg`)
- Provide `image_path` in brief instead of `image_hash`
- Script uploads automatically and retrieves the hash

**Option C — Video:**
1. Upload video in Ads Manager → Video Library
2. Copy the Video ID
3. Provide `video_id` in brief

---

## Config File Integration

If the client's `config/ads-context.config.json` has these optional Meta fields, use them automatically:

```json
{
  "metaAds": {
    "adAccountId": "act_XXXXXXXXXXXXXXXXX",
    "pageId": "FACEBOOK_PAGE_ID",
    "pixelId": "META_PIXEL_ID",
    "instagramAccountId": "INSTAGRAM_BUSINESS_ACCOUNT_ID"
  }
}
```

If these fields are missing from config, ask the user once and suggest adding them to the config file for future use.

---

## Integration Points

### Upstream (reads from):
- `context/projects/[project]/business.md` — budget, conversion goal, target audience
- `context/projects/[project]/offer-angles.md` — copy angles
- `context/projects/[project]/website/` — funnel URLs
- `created/projects/[project]/meta-ads/*.csv` — copy from `/meta-ads-copy` output
- `context/meta-ads/data/adsets.csv` — existing adsets for ads-only mode
- `config/ads-context.config.json` — page_id, pixel_id, instagram_account_id

### Produces (writes to):
- `context/meta-ads/upload-briefs/YYYYMMDD_[project]_[mode].json` — Brief usado para upload
- `created/meta-ads/TIMESTAMP_upload-results.json` — IDs y resultado del upload
- `context/memory/YYYY-MM-DD.md` — Log entry

### Downstream:
- Ads Manager — review and activate after upload
- `/meta-context` — pull fresh data after campaign is active to track performance

---

## Bundled Resources

- **scripts/upload.js** — Meta Marketing API uploader (campaign + adsets + ads)
- **scripts/package.json** — Dependencies (dotenv)
- **references/brief-template-full.json** — Template for full-setup mode
- **references/brief-template-ads-only.json** — Template for ads-only mode
