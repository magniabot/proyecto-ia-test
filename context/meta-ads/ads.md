# Meta Ads — Ads & Creatives

**Account:** Agricola Cachapoal Spa
**Period:** 30 days (2026-02-20 → 2026-03-21)
**Last updated:** 2026-03-22

## Summary

| Metric | Value |
|--------|-------|
| Total ads | 21 |
| Active | 14 |
| Paused | 7 |
| Total spend | 988,629 CLP |
| Total leads | 138 |
| Best CPL | 6,706 CLP (Estático 5 V1 - Copia) |
| Worst CPL | 7,974 CLP (Video 3 V1) — entre ads con ≥5 leads |

---

## Ads Performance

### Clientes Potenciales Sitio Web - CBO - Escalamiento → 062025_Ad Set Ganadores

| Ad | Status | Impressions | Clicks | CTR | Spend | Leads | CPL |
|----|--------|-------------|--------|-----|-------|-------|-----|
| 062025_AC_Video 2 V2 | ACTIVE | 125,103 | 4,096 | 3.27% | 443,200 | 58 | 7,641 |
| 062025_AC_Estático 5 V1 - Copia | ACTIVE | 98,426 | 2,150 | 2.18% | 227,990 | 34 | 6,706 |
| 062025_AC_Estático 2 V1 | ACTIVE | 2,220 | 41 | 1.85% | 6,052 | 2 | 3,026 |
| 062025_AC_Estático_Familiar_3_V1 | ACTIVE | 2,533 | 28 | 1.11% | 5,220 | 2 | 2,610 |
| 062025_AC_Estático 6 V2 | ACTIVE | 3,284 | 65 | 1.98% | 5,701 | 1 | 5,701 |
| 062025_AC_Estático_Familiar_4_V1 | ACTIVE | 738 | 8 | 1.08% | 1,215 | 1 | 1,215 |
| 062025_AC_Estático_Familiar_2_V1 | ACTIVE | 1,002 | 10 | 1.00% | 1,416 | 0 | — |

> Ads pausados en este ad set (sin impresiones en período): 062025_AC_Estático_Familiar_1_V1, 062025_AC_Estático_Familiar_2_V1 duplicado, 062025_AC_Video_Aspiracional_2_V1 - Copia, y otros del ad set pausado.

---

### Clientes Potenciales Sitio Web - ABO - Testing → 102025_T0_Testeo

| Ad | Status | Impressions | Clicks | CTR | Spend | Leads | CPL |
|----|--------|-------------|--------|-----|-------|-------|-----|
| 102025_AC_Video 4_V1 | ACTIVE | 52,103 | 1,903 | 3.65% | 281,888 | 38 | 7,418 |
| 102025_AC_Video 3_V1 | ACTIVE | 2,540 | 136 | 5.35% | 15,947 | 2 | 7,974 |

---

## Top Performers

*(mínimo 5 leads para calificar)*

1. **062025_AC_Estático 5 V1 - Copia** — CPL: 6,706 CLP — Ángulo: estático, visual de parcelas, copy aspiracional (sin texto visible en API, tipo imagen estática)
2. **102025_AC_Video 4_V1** — CPL: 7,418 CLP — Ángulo: video (contenido no recuperable vía API — revisar en Ads Manager)
3. **062025_AC_Video 2 V2** — CPL: 7,641 CLP — Ángulo: video (mayor volumen del período — 58 leads, motor principal de la cuenta)

---

## Underperformers

- **062025_AC_Estático_Familiar_2_V1** — 1,416 CLP de gasto, 0 leads. Gasto bajo pero sin conversión.
- **062025_AC_Video 2 V2** tiene el CPL más alto entre los de volumen, pero también el mayor gasto — vigilar si el CPL sube.

---

## Creative Patterns

**Lo que funciona:**
- **Videos dominan en volumen:** El Video 2 V2 generó 58 leads (42% del total). El Video 4_V1 generó 38 leads. Los videos concentran el 96% de los leads totales del período.
- **Estáticos como soporte eficiente:** El Estático 5 V1 - Copia tiene el mejor CPL ($6,706) con buen volumen (34 leads). Funciona como complemento eficiente al video.
- **Familia como ángulo:** Los estáticos con naming "Familiar" tienen CPL bajos en los pocos leads que generan, pero poco gasto asignado — explorar si vale la pena asignarles más presupuesto.

**Lo que no funciona:**
- **Estáticos con poco presupuesto** no generan suficiente señal — varios tienen 0 leads con spend bajo.
- **CTR del Estático 5** (2.18%) es el más bajo entre los activos, pero su CPL es el mejor → alta tasa de conversión post-click.

**Señal para Vista los Naranjos:**
- Los creativos actuales siguen comunicando el proyecto anterior (Parcelas Elqui). La transición al nuevo proyecto requiere nuevas creatividades completas.
- El formato video es el motor de leads — priorizar producción de video para Vista los Naranjos.
- Copy del Video 1 V1 (pausado) usaba precio explícito ($76M CLP), descripción de terrenos con naranjos y agua, distancias a La Serena — patrón que funcionó en campaña inicial.

## Notes

- La mayoría de los ads activos no tienen `creative.body` o `creative.title` recuperables vía API (son imágenes/videos sin texto en el spec). Para ver el copy completo, revisar directamente en Ads Manager.
- El único ad con copy visible es el 062025_AC_Video 1 V1 (pausado en campaña Test Inicial) — texto aspiracional con precio, ubicación y beneficios del terreno.
