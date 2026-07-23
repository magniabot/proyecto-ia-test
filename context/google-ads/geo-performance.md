# Geographic Performance - Agrícola Cachapoal Spa

## Summary
- **Targeting:** Chile (país completo, geoTargetConstant 2152) en las 4 campañas Search
- **24 ubicaciones de usuario** registradas, dominadas por Chile
- Toda la conversión ocurre en Chile; pequeño leakage internacional (<1% del spend)

## Targeted Locations (campañas activas)

Las 4 campañas Search apuntan a **Chile (geo 2152)**. La campaña activa Vista los Naranjos:

| Campaña | Geo | Status |
|---------|-----|--------|
| Agrícola I Search I NB I Vista los Naranjos | Chile | ENABLED |
| Agrícola I Search I NB | Chile | PAUSED |
| Agrícola I Search I NB Test Landing Page | Chile | ENABLED |
| Agrícola I Search I NB I Vista Los Naranjos | Chile | REMOVED |

## User Location (donde están los usuarios)

| País | Tipo | Cost | Clicks | Conv | Impr |
|------|:----:|-----:|-------:|-----:|-----:|
| Chile | AOI (Area of Interest) | $422,919 | 684 | 14.0 | 3,711 |
| Chile | LOP (Location of Presence) | $96,120 | 122 | 2.0 | 488 |
| Japón | LOP | $1,350 | 2 | 0 | 1 |
| Albania | AOI | $1,160 | 2 | 0 | 3 |
| México | AOI | $901 | 1 | 0 | 2 |
| Uruguay | AOI | $696 | 1 | 0 | 8 |
| Perú | LOP | $637 | 3 | 0 | 14 |
| Argentina | AOI | $598 | 2 | 0 | 16 |
| Paraguay | AOI | $412 | 1 | 0 | 1 |
| Otros (España, Bolivia, USA, UK, etc.) | varios | $0 | 0 | 0 | ~30 |

**AOI vs LOP:**
- **AOI** = usuario buscando algo geográficamente relacionado (e.g., gente fuera de Chile buscando "parcelas en la serena").
- **LOP** = usuario físicamente en esa ubicación cuando buscó.

## Insights

- **99% del spend va a usuarios con conexión a Chile** (AOI o LOP). El leakage internacional es marginal ($5,754 CLP en 30d).
- **AOI domina sobre LOP en Chile** ($423K vs $96K) — la gente busca terrenos en Chile incluso estando físicamente fuera. Esto es esperado para parcelas como segunda vivienda/inversión.
- **Verificar configuración de targeting:** `"presence or interest"` (default) vs `"presence only"`. Si solo quieres usuarios físicamente en Chile, cambiar a "Presence" reduciría el spend AOI.
- **Sin segmentación regional intra-Chile** — no hay datos por ciudad/región. Si se necesita afinar (e.g., excluir RM, foco Norte Chico), correr query `geographic_view` filtrado a Chile regiones.

---
*Last updated: 2026-05-14*
*Date range: 30 días*
*Currency: CLP*
