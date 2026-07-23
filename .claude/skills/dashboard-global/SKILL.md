---
name: dashboard-global
description: |
  Build a global performance dashboard combining CRM (GHL), Meta Ads and (optionally) Google Ads
  into a single HTML view with 4 tabs: Resumen del período, Embudo de conversión, Medios,
  Performance de conversaciones. Magnia branding (white + blue palette, no green).
  AUTO-ACTIVATE for: "build dashboard", "global dashboard", "armar dashboard",
  "dashboard global", "dashboard performance", "create dashboard", "rebuild dashboard".
  Also triggered by /dashboard-global command.
---

# Dashboard Global Builder

Generates `created/dashboards/global-{date}.html` from existing CSV data:
- CRM: `context/crm/contacts.csv`, `opportunities.csv`, `messages.csv`
- Meta Ads: `context/meta-ads/data/insights-campaign.csv`
- Google Ads (optional): `context/google-ads/data/campaigns-last30d.csv`

**Output:** Single-file HTML dashboard, ~200KB, with Magnia branding.

## Process

### Step 1: Check for config

Look for `config/dashboard.config.json`.

- **If exists** → load it and skip to Step 3 (no questions).
- **If missing** → run the interview in Step 2.

### Step 2: Interview (only on first run per client)

Ask the user **3 questions** (auto-detect what you can to keep this short).

**Pre-interview auto-detection:**
- Read `context/crm/opportunities.csv` and extract distinct stage names that appear with non-zero counts. Order them by frequency descending — that's your *guessed* pipeline order.
- Check which CSVs exist: `context/google-ads/data/campaigns-last30d.csv` (Google), `context/meta-ads/data/insights-campaign.csv` (Meta).
- Read `context/projects/{project}/business.md` if it exists; extract `target CPL` and `target CPA` for alerts.

**Then ask:**

1. **Project label** — "¿Cómo querés que aparezca el proyecto en el header? (ej: 'Vista Los Naranjos · Agrícola')"

2. **Pipeline stages confirmation** — Show the auto-detected stages and ask:
   "Detecté estas etapas en tu pipeline GHL: [list]. ¿En qué orden van del funnel? Listame las que querés mostrar separadas por '→' (ej: 'Nuevo Prospecto → Contacto Realizado → Agendado → Visita Atendida → Reserva'). Si querés agregar etapas que aún no tienen data (para visualizar el funnel completo), agregalas también — saldrán como 'por implementar'."

3. **Conversations mode** — "¿Las conversaciones de WhatsApp/CRM las maneja un agente IA o ejecutivos humanos? (ia/manual)"
   - Solo cambia el copy de labels (vista 4 se llama "Performance de conversaciones" en ambos casos; "agente IA" → "ejecutivo" en modo manual).

**Skip Google Ads question** — solo se infiere de la presencia del CSV.

**Then:** Save config to `config/dashboard.config.json` using the template at `reference/config-template.json` as base.

```json
{
  "project_label": "...",
  "channels": { "meta_ads": true, "google_ads": false },
  "conversations_mode": "ia",
  "alerts": { "cpl_threshold_warn": 50000, "target_cpl": 15000, "min_agendamientos_warn": 5 },
  "pipeline_stages": [ { "name": "...", "color": "..." }, ... ]
}
```

**Pipeline stage colors** — assign these gradient colors in order (5 stages max recommended):
`#bac1e8`, `#8b8fc4`, `#5d57e0`, `#453ede`, `#322ba8`. If user lists more than 5, repeat last color.

### Step 3: Build

```bash
python .claude/skills/dashboard-global/scripts/build.py
```

Script reads `config/dashboard.config.json`, all CSVs, and writes `created/dashboards/global-{YYYY-MM-DD}.html`.

### Step 4: Reconfig (when needed)

If the user wants to change config (new pipeline stage, different label, switch IA↔manual):

```bash
python .claude/skills/dashboard-global/scripts/build.py --reconfig
```

This re-runs the interview before building. Or the user can edit `config/dashboard.config.json` directly.

## Data Requirements

**Required:**
- `context/crm/contacts.csv` — leads with utm_source, utm_campaign, dateAdded
- `context/crm/opportunities.csv` — pipeline stage per contact
- `context/crm/messages.csv` — inbound/outbound WhatsApp messages
- `context/meta-ads/data/insights-campaign.csv` — Meta Ads campaign performance

**Optional:**
- `context/google-ads/data/campaigns-last30d.csv` — Google Ads (filtered to last 30 days)
- `context/projects/{project}/business.md` — for target CPL/CPA in alerts

**IMPORTANT — Google Ads CSV must be 30-day filtered:**
The script that pulls Google Ads data sometimes outputs lifetime data when the GAQL query lacks
a WHERE clause. Always generate `campaigns-last30d.csv` via:

```bash
node .claude/skills/gads-context/scripts/query.js \
  --customer-id={id} --login-customer-id={id} \
  --query="$(cat .claude/skills/gads-context/references/campaigns.gaql)" \
  --days=30 \
  --output=context/google-ads/data/campaigns-last30d.csv
```

A pause+remove campaign that shows non-zero clicks is a red flag the data is lifetime.

## Output Structure

The HTML has 4 main tabs:

1. **Resumen del período** — KPIs (Spend, Leads, CPL, Agendamientos, CP-Agend, CP-respondió, CP-engaged, response rate, mensajes totales, placeholders Visita/Reserva) + alertas
2. **Embudo de conversión** — Funnel chart per channel (Total / Meta / Google)
3. **Medios** — Performance por canal + Performance por campaña (con sub-filtro Todas/Google/Meta)
4. **Performance de conversaciones** — Engagement chart, message buckets, timeline diario, agendados list, long-no-close list, todas las conversaciones (con buscador + filtros canal/campaña/etapa)

Si `channels.google_ads = false`: se omiten las filas/filtros Google de las tablas.
Si `conversations_mode = "manual"`: cambian los labels ("agente IA" → "ejecutivo").

## Branding

Paleta Magnia (fija, no configurable):
- Primary: `#453ede` (azul-violeta)
- Accent: `#bac1e8` (azul-gris claro)
- Background page: `#f7f9ff` (lavanda muy suave)
- Background light: `#f0f3ff`
- Text: `#21282b`
- Reservados para destacar: rojo `#ef4444` (alertas críticas), naranja `#f59e0b` (warnings)
- Sin verdes. Sin negros como fondo.

Logo Magnia: lee `clients/magnia/created/assets/logo-base64.txt` (path relativo desde el cliente).

## Bundled Resources

- `scripts/build.py` — main builder
- `reference/config-template.json` — config skeleton
