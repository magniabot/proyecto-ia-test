# Landing Page Experience SOP — Vista los Naranjos

**Fecha:** 2026-05-14
**Scope:** 1 landing page analizada — `https://ventas.parcelaselqui.com/mini-sitio-948484`
**Campaña activa:** Agrícola I Search I NB I Vista los Naranjos
**Business Context:** Cargado — Fase Launch, modo Growth, CPL target $15.000 CLP

---

## Hallazgo crítico

**La LP comienza con contenido placeholder de una plantilla de servicios de jardinería en inglés** ("Complete Care For All Your Landscape Needs", Lorem ipsum, "Book Appointment", "See Our Services") **antes del contenido real del proyecto**.

Esto es causa directa y suficiente del `post_click_quality_score = 2` en el 100% de las keywords. Cualquier usuario que llega desde un ad de parcelas en La Serena/Valle del Elqui ve primero contenido de jardinería en inglés. Google rastrea bounce rate post-click y este patrón degrada uniformemente el LP Experience score.

---

## Resumen ejecutivo

| Problema | Severidad | Fix complexity |
|----------|:---------:|:--------------:|
| Placeholder de jardinería en inglés above-the-fold | 🔴 Crítica | Baja (eliminar del page builder) |
| Sin transparencia legal (RUT, razón social, política de privacidad) | 🔴 Crítica | Media |
| Hero genérico ("¡GRAN LANZAMIENTO ABRIL 2026!") + headline desactualizado (mayo ya pasó) | 🔴 Alta | Baja |
| Inconsistencia de precios ($5M vs $6M de descuento; $75M vs $76M base) | 🟠 Alta | Baja |
| Nombre del proyecto "Vista los Naranjos" no aparece en ningún lado | 🟠 Alta | Baja |
| Sin teléfono / WhatsApp visible (producto $70-76M) | 🟠 Media | Baja |
| Misma LP para 2 clústeres con frames distintos (La Serena vs Valle del Elqui) | 🟠 Media | Alta (requiere 2da LP) |

---

## Phase 1: Audit

### 1.1 Test de los 5 segundos

Above the fold el usuario ve:
1. "Complete Care For All Your Landscape Needs" + Lorem ipsum
2. Imagen genérica de paisajismo
3. Botones "Book Appointment" / "See Our Services"
4. Recién después: "¡GRAN LANZAMIENTO ABRIL 2026!"

| Pregunta del visitante | Se responde en 5 seg? |
|------------------------|:---------------------:|
| ¿Dónde estoy? | ❌ |
| ¿Qué me ofrecen? | ❌ |
| ¿Por qué me conviene? | ❌ |
| ¿Por qué confiar? | ❌ |
| ¿Qué hago ahora? | 🟡 parcial |

**Resultado: 0/5** — necesita reconstrucción completa del hero.

### 1.2 Message Match por clúster de búsqueda

| Keyword | Ad headline típico | LP headline | Match |
|---------|--------------------|-------------|:-----:|
| parcelas valle elqui (Broad) | "Tu parcela en Valle del Elqui" | "¡GRAN LANZAMIENTO ABRIL 2026!" | 🟡 Parcial |
| terrenos valle del elqui (Exact) | "Vista privilegiada al Elqui" | Subheadline matchea, hero no | 🟡 |
| parcelas en venta la serena (Exact) | "Parcelas en Venta La Serena" (DKI) | Hero no menciona La Serena | ❌ |
| terreno en la serena (Exact) | "Tu parcela en Valle del Elqui" | LP habla del Valle del Elqui (20 km de la ciudad) | ❌ |
| parcelas en la serena con agua y luz (Exact) | DKI Elqui | Menciona agua/luz pero enterrado | ❌ |
| terrenos a la venta en la serena (Broad) | "Parcelas en Venta La Serena" | Sin confirmación geográfica La Serena | ❌ |

**Patrón:** La LP rinde razonablemente para queries Valle del Elqui post-fix del placeholder, pero falla mensaje-match para queries La Serena (~50% del spend).

### 1.3 Trust & Transparencia

| Elemento | Presente |
|----------|:--------:|
| Nombre de empresa/razón social | ❌ |
| RUT | ❌ |
| Dirección física | ❌ |
| Teléfono visible | ❌ |
| Email de contacto | ❌ |
| WhatsApp | ❌ |
| Política de privacidad (Ley 19.628) | ❌ |
| Consentimiento de datos en formulario | ❌ |
| Términos y condiciones | ❌ |
| Testimonios con nombre/fecha | ❌ (solo estrellas sin texto real) |
| Historial de ventas (proyecto anterior) | ✅ |
| Imágenes reales del proyecto | ✅ |
| Precios claros | 🟡 (con inconsistencia $5M/$6M) |

**Trust score: 3/13.** Gap crítico para LP Experience y para cumplimiento legal Ley 19.628 (datos personales).

### 1.4 Ratio de atención y CTAs

- Links de navegación: 0
- CTAs al objetivo (formulario): **11 instancias del mismo botón** con texto idéntico "¡Quiero ver disponibilidad de terrenos!"
- Sin CTA sticky en mobile
- 11 repeticiones del mismo texto se sienten robóticas → variar formulación

### 1.5 Estructura existente

La estructura post-hero es razonable:
- Features (vistas, agua/luz, caminos, superficie)
- Audiencia objetivo
- 6 bloques de características con imágenes
- Precios con descuento
- FAQ (10 preguntas — activo fuerte, resuelve objeciones de financiamiento, agua, rol propio)
- Formulario

**Mejora de orden:** prueba social (proyecto anterior vendido) y precio deberían aparecer antes del FAQ.

### 1.6 Performance técnica (verificación manual)

Pendiente ejecutar [PageSpeed Insights](https://pagespeed.web.dev/) sobre la URL. Riesgos esperables por construcción en page builder + placeholder content:
- **LCP:** probable > 2.5s por imagen hero grande
- **CLS:** riesgo alto — el placeholder de plantilla puede causar layout shift cuando carga el contenido real

---

## Phase 2: Recomendaciones priorizadas

### 🔴 P1 — Eliminar contenido placeholder de jardinería (INMEDIATO)

**Acción:** Borrar la sección "Complete Care For All Your Landscape Needs" del page builder.

**Impacto esperado:** −30% a −40% del CPA solo con este fix (bounce rate inmediato cae). Probable salto del LP score de Below Average a Average por sí solo.

**Restricción:** Ninguna.

---

### 🔴 P2 — Agregar transparencia legal mínima (INMEDIATO)

**Elementos a agregar:**
1. Footer con: razón social, RUT, teléfono de contacto
2. Link a política de privacidad
3. Texto bajo formulario: "Al enviar este formulario autorizas a [razón social] a contactarte sobre esta oferta."
4. Nombre del proyecto "Vista los Naranjos" visible

**Restricción:** Ninguna (datos legales ya existen en el negocio).

**Impacto en QS:** Segundo factor más pesado para Google post-placeholder.

---

### 🔴 P3 — Reconstruir el hero (esta semana)

**Problemas actuales:**
- Headline "¡GRAN LANZAMIENTO ABRIL 2026!" — abril ya pasó (estamos en mayo 2026)
- Habla del evento, no de la necesidad del usuario
- No confirma relevancia geográfica

**Hero propuesto:**

```
HEADLINE:    Parcelas en el Valle del Elqui — 5.000 m² con vista privilegiada
SUBHEADLINE: Solo 10 propietarios. Plataformas construidas. Listo para escriturar.
TRUST:       Proyecto anterior agotado | Primer terreno vendido
URGENCIA:    Quedan 2 terrenos con precio de lanzamiento ($70M)
CTA:         Ver disponibilidad de terrenos
```

**Restricciones respetadas:**
- ✅ No menciona tour 360° (queda para post-lead, regla business.md)
- ✅ No muestra precios del proyecto anterior ($45-55M)
- ✅ Eliminada referencia a "Abril 2026"

**Impacto:** Pasa el test de 5 segundos de 0/5 a 4/5.

---

### 🟠 P4 — Corregir inconsistencia de precios (esta semana)

| Lugar | Versión actual | Debe ser |
|-------|----------------|----------|
| Descuento | $5M y $6M (inconsistente) | $5.000.000 (fuente: business.md) |
| Precio base | $76M (ads) vs $75M (business.md) | **Confirmar con cliente** y estandarizar |
| Precio con bono | $70M | $70.000.000 (mantener) |

**Acción adicional:** Antes de cambiar, validar con el cliente cuál es el precio base correcto. Hoy hay desalineación entre ads ($76M) y business.md ($75M).

---

### 🟠 P5 — Teléfono / WhatsApp visible (próximas 2 semanas)

Producto de $70-76M → muchos compradores quieren hablar antes de dejar formulario. La ausencia de teléfono genera desconfianza.

**Acción:**
- Botón flotante de WhatsApp (sticky)
- Teléfono en header o footer
- Alternativa al formulario

**Impacto esperado:** +10–20% en leads, especialmente perfil minero (target del proyecto).

---

### 🟠 P6 — Actualizar copy de urgencia (próximas 2 semanas)

- Eliminar TODA referencia a "Lanzamiento Abril 2026" (ya caducó)
- Barra sticky superior: "Solo quedan 2 terrenos con precio $70M | El descuento cierra cuando se agoten"
- Lenguaje presente: "En venta ahora", "Disponibilidad actual"

---

### 🟠 P7 — LPs dedicadas por clúster (mediano plazo)

**Contexto:** El SOP de ad-relevance ya recomendó split en 2 ad groups (La Serena vs Valle del Elqui). Sin LPs dedicadas, el split mejora relevance pero deja el problema de message-match a nivel LP.

**LP propuesta para clúster "La Serena":**
```
HEADLINE:    Parcelas a 20 min de La Serena — Valle del Elqui
SUBHEADLINE: 5.000 m² con vista privilegiada. A 15 min del aeropuerto.
DIFERENCIADOR: Más tranquilidad que la ciudad. Mismo acceso.
```

**LP propuesta para clúster "Valle del Elqui":** la actual (post-fix de P1-P4) sirve bien.

**Orden de ejecución:** Hacer P1-P4 primero. P7 después del split de ad groups.

---

## Recomendaciones bloqueadas por restricciones

| Recomendación | Bloqueada por | Alternativa |
|---------------|---------------|-------------|
| Tour 360° en LP pública | business.md: se usa post-lead | Fotos drone estáticas (sí permitido) |
| Mencionar precios proyecto anterior | business.md: eliminar $45-55M | "Proyecto anterior 100% vendido" sin cifra |

---

## Phase 3: Plan de validación

### Métricas a monitorear

| Timeframe | Métrica |
|-----------|---------|
| Días 1-3 | Bounce rate post fix del placeholder |
| 7 días | Conversion rate (formularios / clicks) |
| 14 días | LP Experience label en Google Ads |
| 30 días | `post_click_quality_score` de 2 → 3 |

### Benchmarks

| Métrica | Hoy | Target |
|---------|----:|-------:|
| Conv. rate RSA principal | 2.1% (13.5 conv / 644 clk) | ≥ 3.5% |
| Bounce rate | sin dato | reducción ≥ 15 pp |
| CPL | ~$26.881 CLP | ≤ $15.000 CLP |

**Nota:** Benchmark típico para LP inmobiliaria con form simple = 3-5% conv-rate. La LP actual (2.1%) está por debajo, consistente con los problemas identificados.

---

## Definition of Done

- [ ] Contenido placeholder de jardinería eliminado del page builder
- [ ] Footer con razón social, RUT y teléfono agregado
- [ ] Link a política de privacidad presente
- [ ] Consentimiento de datos en el formulario
- [ ] Hero reconstruido sin referencia a "Lanzamiento Abril"
- [ ] Precios estandarizados (confirmar $75M vs $76M con cliente)
- [ ] Nombre "Vista los Naranjos" visible en la LP
- [ ] Botón de WhatsApp o teléfono visible
- [ ] LP pasa el test de 5 segundos (4/5 o 5/5)
- [ ] `post_click_quality_score` ≠ Below Average por 14+ días consecutivos
- [ ] Conv. rate ≥ 3.5% sostenido 14 días

---

## Coordinación con Ad Relevance SOP

| Acción | Origen | Cuándo |
|--------|--------|--------|
| Split de ad groups (La Serena / Valle del Elqui) | Ad Relevance SOP | Día 1 |
| Nuevo RSA "Parcelas La Serena" | Ad Relevance SOP | Día 1 |
| Eliminar placeholder + transparencia legal + hero | LP SOP (este) | Día 1 (paralelo) |
| Corregir precios + WhatsApp | LP SOP | Esta semana |
| 2ª LP dedicada a clúster "La Serena" | LP SOP | Post-split, 2-3 semanas |

**Las acciones de día 1 del ad-relevance SOP y del LP SOP son 100% paralelas — sin dependencias.**

---

## Comparación con análisis previos

No existían reportes previos en `context/analysis/qs-landing-page-*.md`. Todos los hallazgos son nuevos.

El único contexto previo relevante (del qs-decider y ad-relevance) ya indicaba `post_click_quality_score = 2` en el 100% de las keywords. Este reporte identifica los gaps específicos.

---

*Last updated: 2026-05-14*
*Origen: Agent `landing-page-analyzer` (SOP improve-landing-page-experience)*
