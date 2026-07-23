# Skill: reporte-mensual

**Comando:** `/reporte-mensual [nombre_cliente]`

## Propósito

Genera un reporte mensual de performance completo para un cliente de la agencia. Extrae data de Google Ads, Meta Ads y GHL, consolida el funnel completo, genera insights con Claude comparando contra los targets del cliente, y produce un Google Slides listo para presentar basado en el template estándar de la agencia.

## Cuándo se activa

AUTO-ACTIVAR para: "generar reporte mensual", "crear reporte cliente", "reporte de performance", "armar el reporte", "reporte mensual [cliente]".
También activado por el comando `/reporte-mensual [nombre_cliente]`.

## Precondiciones

Antes de ejecutar, verificar:
1. Existe `config/clientes/[nombre_cliente].json` con las credenciales y targets del cliente
2. Las variables de entorno de Google Ads, Meta Ads y GHL están configuradas en `.env`
3. Existe el template de Google Slides en el Drive de la agencia (ID definido en la config del cliente)

Si alguna precondición falla, detener y notificar al usuario qué falta configurar.

## Flujo de ejecución

### Paso 1 — Extracción de datos por plataforma

Ejecutar en paralelo los tres scripts de extracción para el mes anterior:

- `scripts/extraer_google_ads.py [nombre_cliente]`
  - Extrae: campañas, ad groups, keywords, search terms, conversiones, spend, CPA, ROAS
  - Fuente: Google Ads API (MCC configurado en `.env`)
  - Output: `tmp/[nombre_cliente]/google_ads.json`

- `scripts/extraer_meta_ads.py [nombre_cliente]`
  - Extrae: campañas, ad sets, ads, reach, frequency, CTR, CPM, conversiones, ROAS
  - Fuente: Meta Marketing API (token en `.env`)
  - Output: `tmp/[nombre_cliente]/meta_ads.json`

- `scripts/extraer_ghl.py [nombre_cliente]`
  - Extrae: leads recibidos, pipeline stages, conversiones a venta, revenue atribuido
  - Fuente: GHL API (API key en config del cliente)
  - Output: `tmp/[nombre_cliente]/ghl.json`

### Paso 2 — Consolidación del funnel

Ejecutar `scripts/consolidar_data.py [nombre_cliente]`:
- Une los tres datasets en una vista de funnel completo: Impresiones → Clics → Leads → Oportunidades → Ventas
- Calcula métricas cross-platform: costo total, leads totales, CPL blended, revenue total
- Compara cada métrica contra los targets definidos en `config/clientes/[nombre_cliente].json`
- Output: `tmp/[nombre_cliente]/reporte_consolidado.json`

### Paso 3 — Generación de insights con Claude

Leer `templates/prompt_insights.md` e inyectar `reporte_consolidado.json`.

Claude analiza y produce:
- Resumen ejecutivo (3-4 líneas: resultado del mes en una frase, qué funcionó, qué no)
- Insights por plataforma (Google Ads, Meta Ads, GHL/CRM)
- Comparación vs. targets (verde/amarillo/rojo por KPI)
- Recomendaciones priorizadas para el mes siguiente (máximo 5)

Output del análisis: `tmp/[nombre_cliente]/insights.md`

### Paso 4 — Generación del Google Slides

Ejecutar `scripts/generar_slides.py [nombre_cliente]`:
- Copia el template de Google Slides (ID en config del cliente) a una nueva presentación
- Pobla cada slide con la data de `reporte_consolidado.json` e `insights.md`
- Sigue la estructura definida en `references/estructura_reporte.md`
- Nombra la presentación: `Reporte [Mes Año] — [Nombre Cliente]`
- Output: URL del Google Slides generado

### Paso 5 — Guardado en Drive

- Mueve la presentación a la carpeta del cliente en Drive (ruta en config)
- Registra la operación en `context/memory/YYYY-MM-DD.md`:

```markdown
## Reporte Mensual Generado
- Cliente: [nombre_cliente]
- Período: [mes año]
- Google Slides: [URL]
- Leads totales: X | CPL: $X | vs. target: +/-X%
```

## Estructura de archivos generados

```
tmp/[nombre_cliente]/
├── google_ads.json
├── meta_ads.json
├── ghl.json
├── reporte_consolidado.json
└── insights.md
```

## Configuración por cliente

Cada cliente necesita un archivo `config/clientes/[nombre_cliente].json` con:

```json
{
  "nombre": "Nombre Cliente",
  "google_ads_customer_id": "XXX-XXX-XXXX",
  "meta_ads_account_id": "act_XXXXXXXXX",
  "ghl_location_id": "XXXXXXXXX",
  "drive_folder_id": "XXXXXXXXX",
  "slides_template_id": "XXXXXXXXX",
  "targets": {
    "leads_mes": 0,
    "cpl_max": 0,
    "ventas_mes": 0,
    "cpa_max": 0,
    "roas_min": 0,
    "budget_mensual": 0
  },
  "moneda": "CLP",
  "timezone": "America/Santiago"
}
```

## Scripts

| Script | Responsabilidad |
|--------|----------------|
| `extraer_google_ads.py` | Conecta a Google Ads API y extrae métricas del mes anterior |
| `extraer_meta_ads.py` | Conecta a Meta Marketing API y extrae métricas del mes anterior |
| `extraer_ghl.py` | Conecta a GHL API y extrae pipeline + conversiones del mes anterior |
| `consolidar_data.py` | Une los tres datasets, calcula métricas blended, compara vs. targets |
| `generar_slides.py` | Genera el Google Slides desde el template y sube a Drive |

## Referencias

- `references/estructura_reporte.md` — Las 6 secciones del reporte y qué data va en cada slide
- `templates/prompt_insights.md` — Prompt para que Claude genere el análisis y recomendaciones
