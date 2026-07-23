# Ad Relevance SOP — Vista los Naranjos

**Fecha:** 2026-05-14
**Campaña:** Agrícola I Search I NB I Vista los Naranjos
**Ad Group analizado:** Venta de Terrenos
**Scope:** 1 ad group, 9 keywords activas, 2 RSAs activos
**Business Context:** Cargado — Fase Launch, modo Growth, CPL target $15.000 CLP

---

## Resumen ejecutivo

**Diagnóstico:** Ad Relevance Below Average en 6 de 9 keywords (clúster "La Serena"). El ad group actual mezcla dos frames geográficos distintos ("La Serena" ciudad vs "Valle del Elqui" entorno natural) bajo un mismo ad group con RSAs anclados al frame Elqui.

**Recomendación principal:** **Split del ad group en 2** ("Parcelas Valle del Elqui" y "Parcelas La Serena") con RSAs dedicados y negativos cruzados.

**Headline Test:** FALLA. No existe un headline único que sirva a ambos clústeres sin diluir relevancia.

---

## Alineamiento con prioridades de negocio

- **Fase:** Launch (urgencia alta — vender 10 parcelas antes de septiembre 2026)
- **Modo:** Growth — volumen sobre eficiencia
- **Prioridad de campaña:** Non-Brand High-Intent (#1 en business.md)
- **Constraint relevante:** Max CPL $15.000 CLP (hoy ~$26.881 estimado — supera el techo)

Mejorar Ad Relevance del clúster "La Serena" (58% del spend) reduce CPC efectivo y acerca el CPL al constraint sin tocar bids.

---

## Fase 1: Diagnóstico

### Clúster A — Valle del Elqui (3 keywords, Ad Relevance Average)

| Keyword | Match | Ad Rel | QS | Clicks | Conv | CTR |
|---------|:-----:|:------:|:--:|------:|-----:|----:|
| parcelas valle elqui | Broad | Average (4) | 7 | 88 | 2.0 | 25.1% |
| terrenos valle del elqui | Broad | Average (4) | 7 | 81 | 0.0 | 25.8% |
| terrenos valle del elqui | Exact | Average (4) | 7 | 39 | 1.3 | 28.7% |

### Clúster B — La Serena (6 keywords, Ad Relevance Below Average)

| Keyword | Match | Ad Rel | QS | Clicks | Conv | CTR |
|---------|:-----:|:------:|:--:|------:|-----:|----:|
| parcelas en venta la serena | Broad | Below Avg (2) | 5 | 153 | 6.0 | 18.3% |
| parcelas en venta la serena | Phrase | Below Avg (2) | 5 | 92 | 3.0 | 16.1% |
| terreno en la serena | Exact | Below Avg (2) | 5 | 54 | 1.0 | 11.4% |
| terrenos a la venta en la serena | Broad | Below Avg (2) | 5 | 45 | 0.0 | 19.2% |
| venta parcela en la serena | Broad | Below Avg (2) | 5 | 6 | 0.0 | 25.0% |
| parcelas en la serena con agua y luz | Exact | Below Avg (2) | 5 | 0 | 0.0 | — |

### Distribución de spend por clúster

| Clúster | Spend | Clicks | Conv | CTR promedio |
|---------|------:|-------:|-----:|-------------:|
| La Serena | $206.428 | 350 | 10 | ~17% |
| Valle del Elqui | $151.819 | 208 | 3.3 | ~26% |

**El clúster con peor Ad Relevance concentra el 58% del spend.**

### Análisis de Intent

| Clúster | Intent dominante | Frame mental del usuario |
|---------|------------------|--------------------------|
| La Serena | Transaccional geográfico | "Quiero un terreno cerca de La Serena" (ciudad como ancla) |
| Valle del Elqui | Transaccional experiencial | "Quiero un terreno en el valle" (entorno natural como ancla) |

---

## Análisis semántico de los 2 RSAs activos

### RSA #801796489838 — "Valle del Elqui" (winner: 644 clk, 13.5 conv, CTR 19.9%)

**Headlines actuales:**
1. `{KeyWord:Parcelas Elqui}` (DKI)
2. Tu parcela en Valle del Elqui
3. Comunidad reducida
4. Solo quedan 9 disponibles
5. Rol propio y entrega inmediata
6. Vista privilegiada al Elqui
7. Elige tu terreno hoy
8. Precio especial lanzamiento
9. Trabajas duro. Mereces esto
10. Valores: $76.000.000

**Cobertura semántica para queries Elqui:** Alta. Múltiples señales (DKI + 3 headlines + D1).
**Cobertura semántica para queries La Serena:** Baja. Solo via DKI; headlines anclan en "Elqui/Valle del Elqui".

### RSA #801799090442 — "camino Elqui" (174 clk, 2.5 conv, CTR 16.7%)

**Headlines actuales:**
1. Parcelas en Venta camino Elqui
2. Entorno Natural y Tranquilo
3. Alta plusvalía comprobada
4. Agua Garantizada
5. +90 parcelas ya vendidas (⚠ del proyecto anterior — riesgo de claim engañoso para Vista los Naranjos)
6. Nuevo Lanzamiento
7. Valores desde $76 millones
8. A 15 min del Aeropuerto
9. Agenda una Visita hoy
10. `{KeyWord:parcelas en la serena}` (DKI)

**Cobertura La Serena:** Parcial — DKI en H10 contrarrestado por H1 "camino Elqui" estático.

**Conclusión:** Ambos RSAs están calibrados para Elqui. La estrategia de "DKI en slot secundario" no es suficiente cuando headlines estáticos anclan a otra geografía.

---

## Fase 2: Fixes Estructurales

### Estructura propuesta: SPLIT en 2 ad groups

#### Ad Group 1 — "Parcelas Valle del Elqui" (renombrar el existente)

**Keywords que se quedan:**
- parcelas valle elqui [broad]
- terrenos valle del elqui [broad]
- terrenos valle del elqui [exact]

**RSA activo:** #801796489838 (con correcciones — ver Fase 3.1)

**Negativos a agregar (ad group level):**
- la serena [broad]
- serena [broad]

#### Ad Group 2 — "Parcelas La Serena" (nuevo)

**Keywords a mover:**
- parcelas en venta la serena [broad]
- parcelas en venta la serena [phrase]
- terreno en la serena [exact]
- terrenos a la venta en la serena [broad]
- venta parcela en la serena [broad]
- parcelas en la serena con agua y luz [exact]

**RSA:** Nuevo (ver Fase 3.2)

**Negativos a agregar (ad group level):**
- valle del elqui [broad]
- elqui [broad]

### Negativos de campaña a evaluar

- **"10 millones"** [phrase] — el search term "terrenos la serena 10 millones" (31 imp, 10 clicks) no es compatible con el precio $70-75M del producto.

### Riesgo de aprendizaje

La campaña corre en Max Conversions a nivel campaña. El split no reinicia el aprendizaje del bidding (se preserva a nivel campaña). El clúster La Serena conserva ~350 clicks y 10 conv históricos — suficiente para no caer en cold start. **Riesgo: bajo.**

---

## Fase 3: Fix de Copy

### 3.1 Edición del RSA #801796489838 (Ad Group "Parcelas Valle del Elqui")

**Cambios:**
- H10: `Valores: $76.000.000` → `Precio lanzamiento: $70.000.000`
  *Razón: $76M era del proyecto anterior; precio de lanzamiento real es $70M.*
- H3: `Comunidad reducida` → `Comunidad de solo 10 propietarios` (más específico, mantiene exclusividad)
- Agregar H10 (nuevo): `Valle del Elqui, a 20 min de La Serena` (breadcrumb geográfico opcional)

**RSA final propuesto:**

```
H1:  {KeyWord:Parcelas Elqui}
H2:  Tu parcela en Valle del Elqui
H3:  Comunidad de solo 10 propietarios
H4:  Solo quedan 9 disponibles
H5:  Rol propio y entrega inmediata
H6:  Vista privilegiada al Elqui
H7:  Elige tu terreno hoy
H8:  Trabajas duro. Mereces esto
H9:  Precio lanzamiento: $70.000.000
H10: Valle del Elqui, a 20 min de La Serena

D1: Escapa del ruido. 5.000m² listos para construir en el Valle del Elqui. Elige tu lote hoy.
D2: Proyecto anterior: 100% vendido. Solo quedan 9 lotes en Vista los Naranjos. Agenda tu visita.
D3: Precio único de lanzamiento: $70M. Rol propio y parcelas valle del elqui con entrega inmediata.
```

### 3.2 Nuevo RSA para Ad Group "Parcelas La Serena"

**Método:** Static anchoring en H1 + DKI en H10 + bold activations en descriptions.

```
H1:  Parcelas en Venta cerca de La Serena
H2:  5.000m² a 20 min de La Serena
H3:  Comunidad de solo 10 propietarios
H4:  Solo quedan 9 disponibles
H5:  Rol propio y entrega inmediata
H6:  Seguridad desde el día 1
H7:  Agenda tu visita hoy
H8:  Trabajas duro. Mereces esto
H9:  Precio lanzamiento: $70.000.000
H10: {KeyWord:Terrenos en La Serena}

D1: Terrenos en venta cerca de La Serena: 5.000m², agua, cierre perimetral y cámaras desde el día 1.
D2: Solo 10 propietarios. Proyecto cerrado y seguro a 20 min de La Serena. Elige tu terreno hoy.
D3: Precio único de lanzamiento $70M. Rol propio y entrega inmediata. Bono de $5M para las primeras 3 unidades.
D4: Parcelas en La Serena con agua garantizada, plataformas construidas y portón automático de acceso.
```

**Cobertura semántica del nuevo RSA para queries La Serena:**
- "La Serena" aparece en: H1, H2, H10 (DKI), D1, D2, D4
- Bold activations: "terrenos en la serena" (D1), "Parcelas en La Serena" (D4)
- "cerca de" en H1: honesto (el proyecto está en el valle, no en la ciudad) y mantiene relevancia para queries "la serena"

### 3.3 Pausar RSA #801799090442

Con la nueva estructura, este RSA ya no sirve a ningún clúster específico (su H1 "camino Elqui" no calza ni en Elqui Valle ni en La Serena explícito). Pausar.

---

## Validación de integridad del copy

| Restricción de business.md / brand.md | Cumple |
|---------------------------------------|:------:|
| No mencionar precio anterior ($45-55M proyecto anterior) | ✓ |
| Bono $5M específico (no genérico) | ✓ |
| No incluir tour virtual 360° en comunicación pública | ✓ |
| No promocionar luz eléctrica como disponible inmediata | ✓ |
| Precio $70M (con bono) en headlines | ✓ |
| Español chileno/neutro, sin argentinismos | ✓ |

---

## Definition of Done

- [ ] Ad Group "Venta de Terrenos" renombrado a "Parcelas Valle del Elqui"
- [ ] Ad Group "Parcelas La Serena" creado con los 6 keywords del clúster
- [ ] Negativos `la serena`, `serena` agregados al ad group "Parcelas Valle del Elqui"
- [ ] Negativos `elqui`, `valle del elqui` agregados al ad group "Parcelas La Serena"
- [ ] Negativo `10 millones` agregado a nivel campaña
- [ ] RSA #801796489838 editado: precio $76M → $70M, H3 más específico, agregar H10 breadcrumb
- [ ] Nuevo RSA creado en "Parcelas La Serena" con los 10 headlines + 4 descriptions propuestos
- [ ] RSA #801799090442 pausado
- [ ] Monitor: Ad Relevance del clúster La Serena = Average por 14 días consecutivos

---

## Próximos pasos (orden de ejecución)

1. **Día 1:** Crear ad group "Parcelas La Serena", mover keywords, agregar negativos cruzados.
2. **Día 1:** Crear nuevo RSA para "Parcelas La Serena". Pausar RSA #801799090442.
3. **Día 1:** Editar RSA #801796489838 (precio + H3 + H10).
4. **Día 14:** Revisar Ad Relevance del clúster La Serena. Si persiste Below Average, evaluar landing page (ambos ad groups apuntan al mismo URL — posible factor secundario).
5. **Si Ad Relevance = Average+ post-14d:** Correr `/qs-expected-ctr` si algún keyword sigue con Expected CTR Below Average.
6. **En paralelo:** Considerar correr `/qs-landing-page` desde ya — el `post_click_quality_score = 2` afecta al 100% de keywords, incluyendo las del clúster Elqui que ya tienen relevance sana. Es independiente del trabajo de relevance y puede acelerar la recuperación de QS total.

---

*Last updated: 2026-05-14*
*Origen: Agent `ad-relevance-analyzer` (SOP improve-ad-relevance)*
