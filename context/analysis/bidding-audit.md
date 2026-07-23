# Bidding Audit — Agrícola Cachapoal Spa

**Fecha:** 2026-07-22
**Ventana:** 180 días para el análisis de tendencia (2026-01-23 → 2026-07-20) · 45 días con lag 14 para el scoring (2026-05-24 → 2026-07-08)
**Cuenta:** 4760314854
**Score:** 79/100 (Good) — ver advertencia en la sección Score
**Nota metodológica:** todas las campañas están pausadas, por lo que el pull estándar del skill (filtra `status = ENABLED`) devolvió 0 filas. Los engines se ejecutaron sobre un pull ampliado que incluye campañas `PAUSED`, para poder auditar la última campaña activa (`Exact MaxC`, corrió hasta el 2026-07-20).

---

## Executive read

La cuenta está apagada. Las seis campañas están en `PAUSED` o `REMOVED`, salvo un experimento terminado (`Test Landing Page`, serving status `ENDED`) que quedó en `ENABLED` sin servir. La última actividad real fue el 2026-07-20, hace dos días. Ninguna auditoría de puja tiene sentido sobre una cuenta que no está pujando, así que lo que sigue es el diagnóstico de por qué la performance se degradó hasta el punto en que apagarla fue razonable.

El problema no es la estrategia de puja. Es la conversión. Cuando el proyecto cambió de "Agrícola I Search I NB" (proyecto anterior, $45–55M) a "Vista los Naranjos" ($76M), el CVR se derrumbó de 5,1% a 1,5% y el CPA se multiplicó por 6,3x, de $7.700 a $48.372. Esto es exactamente el riesgo que `business.md` ya anticipaba: desalineación entre anuncios y landing, más un salto de precio de 40–60%. Ajustar targets de puja sobre un CVR de 1,5% no arregla nada — solo cambia la velocidad a la que se quema el presupuesto.

El score formal es 79/100, pero está inflado: tres módulos puntúan 100% simplemente porque no hay nada configurado que evaluar. El único módulo con contenido real saca 33%, y el diagnóstico de fondo es que **la puja no está mal configurada, está sin configurar** — sobre una base de conversión que no alcanza el volumen mínimo para que Smart Bidding funcione.

Ese es el hallazgo de puja más importante: con **11 conversiones cada 30 días**, `Exact MaxC` está por debajo del mínimo de 15 que `MAXIMIZE_CONVERSIONS` necesita en Search. El algoritmo viene decidiendo con muestra insuficiente, lo que explica buena parte del salto de CPA entre meses ($19.286 en abril → $45.005 en mayo). Y hay tres campañas de Search repartiéndose esa señal escasa en vez de una sola que llegue al umbral. Consolidar es la acción de bidding de mayor impacto, y va **antes** que cualquier ajuste de target: poner un tCPA sobre 11 conversiones al mes reproduce exactamente lo que ya pasó con `Broad tCPA`, que se creó con target $20.000 contra un CPA real de $48.372 y acumuló 1 impresión en total sin llegar a arrancar nunca.

El tercer hallazgo es de medición y condiciona todo lo anterior: de 12 acciones de conversión, **solo "GHL - Envío de Formulario (Browser)" cuenta como conversión primaria**. Agendamiento de Visita, Lead Precalificado, Reserva y Promesa están todas como secundarias — el algoritmo no las ve. Está optimizando hacia el evento más superficial del embudo, y los datos muestran que ahí es precisamente donde se está perdiendo calidad.

---

## Economía unitaria (confirmada 2026-07-22)

| Input | Valor | Fuente |
|---|---|---|
| Precio de venta | $76.000.000 CLP | `business.md` |
| Margen neto | 20% → $15.200.000 | Confirmado por usuario |
| Close rate lead → venta | 1% | Confirmado por usuario |
| **Break-even CPA** | **$152.000 CLP** | Calculado |
| Target CPA (business.md) | $15.000 CLP | `business.md` |
| PAR (break-even / target) | **10,1x** | Calculado |

**Lectura:** el target de $15.000 es 10x más conservador que el break-even. Eso no es necesariamente un error — puede reflejar una meta de eficiencia y no un límite de rentabilidad — pero significa que el target actual no es el punto donde se pierde plata. Vale la pena decidir explícitamente si $15.000 es una meta o una restricción, porque el auditor y cualquier optimización futura se calibran contra ese número.

⚠️ El close rate del 1% es un supuesto declarado, no un dato medido. Con 3 agendamientos de visita en 5 meses en la campaña nueva, no hay volumen para validarlo. Si el close real fuera 0,5%, el break-even cae a $76.000 y el CPA de julio ($48.372) pasa a consumir el 64% del margen.

---

## Diagnóstico — cascada de restricciones

### 🔴 Capa Conv (Conversión) — RAÍZ PRINCIPAL

La comparación entre proyecto viejo y nuevo:

| Métrica | Search I NB (ene–mar) | Exact MaxC (mar–jul) | Δ |
|---|---|---|---|
| Clics | 2.899 | 3.232 | +11% |
| Costo | $1.147.543 | $2.099.382 | +83% |
| Conversiones (form) | 149,0 | 62,0 | **−58%** |
| CVR | 5,14% | 1,92% | **−63%** |
| CPA | $7.700 | $33.872 | **+340%** |
| CPC | $396 | $650 | **+64%** |

Evolución mensual del CPA — la degradación es sostenida, no un mal mes:

| Mes | Campaña | Clics | Conv | Costo | CPA | CVR |
|---|---|---|---|---|---|---|
| 2026-01 | Search I NB | 412 | 24,0 | $149.956 | $6.248 | 5,83% |
| 2026-02 | Search I NB | 1.477 | 66,0 | $547.206 | $8.291 | 4,47% |
| 2026-03 | Search I NB | 1.010 | 59,0 | $450.380 | $7.631 | 5,84% |
| 2026-03 | Exact MaxC | 193 | 4,0 | $125.996 | $31.499 | 2,07% |
| 2026-04 | Exact MaxC | 974 | 28,0 | $539.641 | $19.286 | 2,87% |
| 2026-05 | Exact MaxC | 696 | 10,0 | $450.053 | $45.005 | 1,44% |
| 2026-06 | Exact MaxC | 773 | 11,0 | $548.348 | $49.850 | 1,42% |
| 2026-07 | Exact MaxC | 596 | 9,0 | $435.344 | $48.372 | 1,51% |

Abril fue el mejor mes de la campaña nueva (CPA $19.286, CVR 2,87%) y desde ahí se degradó de forma consistente. Mayo, junio y julio son estables entre sí en ~$45–50K de CPA: no es ruido, es el nuevo régimen.

### 🔴 Capa Conv — calidad del lead, no solo cantidad

El embudo completo (180 días), donde se ve que el problema es más profundo que el volumen:

| Evento | Search I NB | Exact MaxC |
|---|---|---|
| Form Start | 163 | 61 |
| **Envío de Formulario (Browser)** ← única contada | **149** | **62** |
| Envío de Encuesta | 126 | 53 |
| Agendamiento de Visita a terreno | 12 | 3 |
| Lead Precalificado | 12 | 2 |

Tasas de paso y costo real:

| Métrica | Search I NB | Exact MaxC | Δ |
|---|---|---|---|
| Form → Agendamiento | 8,05% | 4,84% | −40% |
| Form → Precalificado | 8,05% | 3,23% | −60% |
| **Costo por visita agendada** | **$95.629** | **$699.794** | **7,3x** |
| **Costo por lead precalificado** | **$95.629** | **$1.049.691** | **11x** |

Este es el hallazgo más duro del análisis. La campaña nueva no solo genera menos formularios por peso gastado — los formularios que genera son sustancialmente peores. El costo por visita agendada se multiplicó por 7,3.

### 🟠 Capa M (Medición) — señal de optimización equivocada

De 12 acciones de conversión activas, solo 3 tienen `primary_for_goal = true`:

| Acción | Categoría | Primaria | Se optimiza |
|---|---|---|---|
| GHL - Envío de Formulario (Browser) | SUBMIT_LEAD_FORM | ✅ | Sí |
| YouTube channel subscriptions | ENGAGEMENT | ✅ | Sí ⚠️ |
| YouTube follow-on views | UNKNOWN | ✅ | Sí ⚠️ |
| GHL - Agendamiento de Visita a terreno | BOOK_APPOINTMENT | ❌ | No |
| GHL Lead Precalificado | QUALIFIED_LEAD | ❌ | No |
| GHL - Lead Compra Terreno | CONVERTED_LEAD | ❌ | No |
| GHL - Reserva | CONVERTED_LEAD | ❌ | No |
| GHL - Promesa | CONVERTED_LEAD | ❌ | No |
| GHL - Lead Asiste a Visita | QUALIFIED_LEAD | ❌ | No |
| GHL - Lead Calificado (Coopeuch) | QUALIFIED_LEAD | ❌ | No |
| GHL - Envío de Encuesta | SUBMIT_LEAD_FORM | ❌ | No |
| GHL - Form Start | SUBMIT_LEAD_FORM | ❌ | No |

Implicancias:

1. **El algoritmo optimiza el evento más superficial del embudo.** Maximiza formularios, y los datos muestran que la calidad de esos formularios se derrumbó. El bidding hizo exactamente lo que se le pidió.
2. **Las dos acciones de YouTube están marcadas como primarias.** Hoy son inocuas porque Demand Gen está pausada. Si se reactiva, `ENGAGEMENT` y `UNKNOWN` entran a competir como señal de puja y contaminan la optimización. Tienen además `always_use_default_value = true` con valor 1.
3. **No hay volumen para optimizar hacia calidad.** Cambiar el objetivo a "Agendamiento de Visita" es lo correcto conceptualmente, pero con 3 eventos en 5 meses no hay señal suficiente (Smart Bidding necesita ~30/mes). Esto no es accionable hoy.

### 🟠 Capa Comp (Competitiva)

- CPC subió de $396 a $650 (+64%), con tendencia sostenida al alza dentro de la campaña nueva ($554 en abril → $730 en julio).
- Impression share 76,6%, rank lost IS 16,5%, budget lost IS 6,8%.
- El budget lost bajo (6,8%) confirma que **el presupuesto no era la restricción**. La pérdida es por ranking, y ranking se recupera con relevancia y Quality Score, no con puja.

### 🟡 Capa T (Bidding) — consecuencia, no causa

| Campaña | Estrategia | Target | Presupuesto/día | Estado |
|---|---|---|---|---|
| Agrícola - Vista los Naranjos - Exact MaxC | MAXIMIZE_CONVERSIONS | **sin tCPA** | $22.000 | PAUSED |
| Agrícola - Vista Los Naranjos - Broad tCPA | MAXIMIZE_CONVERSIONS | tCPA $20.000 | $25.000 | PAUSED |
| Agrícola I Search I NB | MAXIMIZE_CONVERSIONS | sin tCPA | $18.000 | PAUSED |
| Agrícola I Demand Gen | MAXIMIZE_CONVERSIONS | sin tCPA | $10.000 | PAUSED |
| Agrícola I Search I NB Test Landing Page | TARGET_SPEND | — | $18.000 | ENABLED / ENDED |
| Agrícola I Search I NB I Vista Los Naranjos | MAXIMIZE_CONVERSIONS | sin tCPA | $18.000 | REMOVED |

**BID-D01 — MaxConversions sin techo de CPA (2 campañas).** `MAXIMIZE_CONVERSIONS` sin `target_cpa` gasta el presupuesto completo sin límite de costo por conversión. Con CVR sano esto es defendible; con CVR de 1,5% es un acelerador de pérdida. Julio: $435.344 gastados, 9 conversiones.

**BID-D09 — Inanición por target inalcanzable (`Broad tCPA`).** tCPA $20.000 contra un CPA real de cuenta de $48.372: el target está 59% por debajo de lo alcanzable. La campaña acumuló **1 impresión y 0 clics en total**. No es un problema de presupuesto ($25.000/día asignados, sin usar) — el algoritmo simplemente no encuentra subastas donde pueda cumplir ese target.

**BID-D03 — Volumen insuficiente para Smart Bidding (las 3 campañas Search).** Este es el hallazgo del engine que más cambia el plan de acción. `MAXIMIZE_CONVERSIONS` en Search requiere un mínimo de **15 conversiones/30d** para operar con señal confiable. La realidad:

| Campaña | Conv/30d | Mínimo | Estado |
|---|---|---|---|
| Agrícola - Vista los Naranjos - Exact MaxC | 11 | 15 | ❌ 27% por debajo |
| Agrícola - Vista Los Naranjos - Broad tCPA | 0 | 15 | ❌ sin señal |
| Agrícola I Search I NB | 0 (pausada) | 15 | ❌ sin señal |

Smart Bidding con 11 conversiones al mes está operando cerca del ruido estadístico. Eso explica buena parte de la volatilidad del CPA entre meses ($19.286 en abril → $45.005 en mayo) — no es solo degradación real, es un algoritmo tomando decisiones con muestra insuficiente.

**Consecuencia directa: no poner tCPA todavía.** Un tCPA exige *más* señal que MaxConversions, no menos. Aplicarlo a una campaña de 11 conv/mes reproduce lo que ya pasó con `Broad tCPA`. El problema a resolver primero es la fragmentación: hay **3 campañas de Search compitiendo por la misma señal escasa**. Consolidadas suman masa crítica; separadas, ninguna llega al mínimo.

**Sin portfolios, sin reglas de valor de conversión, sin ajustes de puja manuales.** Módulos 4, 5 y 7 del auditor no aplican en esta cuenta.

### 🟡 Capa Bud (Presupuesto)

Gasto de julio: $435.344 en 20 días = $21.767/día → **proyección mensual $653.010** contra un presupuesto declarado de $500.000 en `business.md`. **31% por encima.** No es crítico dado que la cuenta está apagada, pero el número declarado y el real no coinciden y conviene reconciliarlos antes de reactivar.

---

## Qué NO es un problema

- **Presupuesto insuficiente.** Budget lost IS de 6,8% descarta esta hipótesis.
- **Falta de tráfico.** 3.232 clics en la campaña nueva, IS 76,6%. Hay volumen de sobra.
- **Tracking roto.** Las conversiones se registran correctamente en las 12 acciones. El problema es cuál de ellas se optimiza, no si se miden.
- **CPA sobre break-even.** A $48.372 contra un break-even de $152.000, la campaña técnicamente seguía siendo rentable en el papel. Está 3,2x sobre el *target*, no sobre el punto de pérdida. Este matiz importa: la decisión de apagar fue de eficiencia, no de supervivencia.

---

## Acciones recomendadas — en orden

### 1. 🔍 Antes de reactivar: arreglar la conversión (bloqueante)

El CVR de 1,5% es la restricción real. Reactivar sin tocar esto reproduce el mismo resultado.

- `/lp-auditor` — `business.md` ya declara que "~50% de visitas se pierden por desalineación entre ads y landing (muestran proyecto viejo)". Esa hipótesis está sin verificar y explica la mayor parte de la caída.
- `/offer-auditor` — el salto de $45–55M a $76M es de 40–60%. Hay que validar si la oferta actual sostiene ese precio en el mensaje.
- **Material visual pendiente** — `business.md` lo lista como restricción conocida y sigue sin resolverse.

### 2. 🔧 Corregir la señal de optimización

- Quitar `primary_for_goal` de **YouTube channel subscriptions** y **YouTube follow-on views**. No aportan señal de negocio y contaminarán la puja si se reactiva Demand Gen. Bajo riesgo, hacer ya.
- Evaluar subir **Envío de Encuesta** o **Agendamiento de Visita** a primaria — pero solo cuando el volumen lo permita. Hoy no lo permite.
- Handoff: `/tracking-specialist` para revisión completa de las 12 acciones.

### 3. ✅ Al reactivar — configuración de puja

**Primero consolidar, después poner targets.** El orden importa: con 11 conv/30d ninguna campaña alcanza el mínimo de 15 que Smart Bidding necesita.

- **Consolidar las campañas de Search en una sola.** Hoy hay tres (`Exact MaxC`, `Broad tCPA`, `Search I NB`) repartiéndose una señal que no alcanza ni para una. Unificadas, la campaña superaría el umbral de 15 conv/30d y el algoritmo dejaría de operar sobre ruido. Esta es la acción de bidding de mayor impacto.
- **Eliminar `Broad tCPA`.** tCPA $20.000 contra un CPA real de $48.372: inalcanzable. Lleva meses ocupando estructura con 1 impresión acumulada. Sus keywords, si sirven, van a la campaña consolidada.
- **Mantener MaxConversions sin target al reactivar.** Contraintuitivo pero correcto: hasta no recuperar volumen, agregar un tCPA restringe todavía más un algoritmo que ya tiene poca señal. El control de gasto en esta etapa va por presupuesto diario, no por target.
- **Recién con 15+ conv/30d sostenidas, introducir tCPA.** Arrancar cerca del CPA alcanzable —no en $15.000— y bajar en pasos de ≤20%: $45.000 → $36.000 → $29.000, validando volumen en cada escalón.
- **No apilar cambios.** Consolidación y cambio de target en la misma semana hacen imposible leer qué funcionó. Consolidar, esperar 14 días, después tocar targets.
- **Reconciliar el presupuesto** declarado ($500.000) con el real (~$653.000 proyectado).

### 4. ⚠️ Pendientes de contexto

- `account-changelog.md` está al 2026-05-14 (69 días). Correr `/account-changelog` — hubo una reestructuración completa de campañas después de esa fecha que no está registrada.
- `business.md` → sección "Bidding Strategy" tiene valores plantilla (tCPA $20 / $50, campañas "NB - Broad", "Competitor" que no existen en la cuenta). Desactualizada respecto de la estructura real.
- Confirmar por qué se pausó todo el 2026-07-20/21 — si fue decisión comercial (proyecto vendido, pausa estacional) el análisis cambia de foco.

---

## Score — 79/100 (Good) ⚠️ leer con cuidado

Los 4 engines del auditor se ejecutaron sobre la ventana de 45 días con lag 14 (2026-05-24 → 2026-07-08), incluyendo campañas pausadas. 74 diagnósticos evaluados.

| Módulo | Peso | Score | Puntos |
|---|---|---|---|
| Strategy Selection | 20 | **33%** | 6,7 / 20 |
| Target Validation | 25 | N/A | — |
| Learning Phase | 15 | 100% | 15,0 / 15 |
| Portfolio Health | 15 | N/A → 100% | 15,0 / 15 |
| Bid Adjustments | 5 | N/A → 100% | 5,0 / 5 |
| CPC & Cost Health | 10 | 100% | 10,0 / 10 |
| Conversion Value Rules | 10 | N/A | — |
| **Total** | **65 evaluado** | | **79/100** |

**El 79 está inflado y no debe leerse como "la cuenta está bien".** Tres de los módulos que puntúan 100% lo hacen porque *no hay nada que evaluar*: no existen portfolios, no hay ajustes de puja manuales, no hay reglas de valor de conversión. Un módulo sin configuración no es un módulo sano.

El único módulo con sustancia real es **Strategy Selection: 33%** — 6 FAIL sobre las 3 campañas de Search, todos por volumen de conversión insuficiente para Smart Bidding.

**Target Validation quedó N/A**, y eso es en sí mismo el hallazgo: ninguna campaña activa tiene un target definido, así que no hay nada que validar. La ausencia de target no se penaliza en el modelo de scoring, pero es precisamente la brecha estructural del setup.

Lectura corregida: **la puja no está mal configurada — está sin configurar, sobre una base de conversión que no da el volumen mínimo para que funcione.**

---

*Generado: 2026-07-22 | Data: API Google Ads, 180 días | Economía unitaria confirmada por usuario*
