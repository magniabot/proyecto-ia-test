# Auditoría de Landing / Funnel — Vista los Naranjos

**URL:** https://funnel.parcelaselqui.com/6a0379c63108b9920e9217ef/
**Tipo:** Mobile funnel multi-paso (Perspective) — calificatorio
**CTA principal:** "Me interesa visitarlo" → agendamiento a visita de terreno
**Fecha auditoría:** 2026-06-10
**Método:** Extracción completa del funnel vía datos JSON de Perspective (todas las páginas, copy, preguntas, formularios, tracking). No se midió velocidad/Core Web Vitals (sin acceso a Lighthouse/DevTools en esta corrida).

---

## Score global (indicativo): 50% — Needs Attention

| Módulo | Score | Estado |
|--------|-------|--------|
| Structural (D01–D12) | 48% | Needs Attention |
| Message Match (D13–D16) | 50% | Needs Attention |
| Technical (D17–D24, parcial) | 55% | Needs Attention |
| Performance (D25–D31) | No corrido | Requiere data de Google/Meta Ads |
| URL Health (D32–D37) | No corrido | — |
| Ecommerce (D38–D40) | N/A | No es ecommerce |

> El score excluye velocidad/CWV (no medidos) y performance por fuente (requiere data de ads). Es un diagnóstico de **calidad de página y mensaje**, que es donde está la hipótesis del cliente.

---

## Mapa del funnel (reconstruido)

1. **Start** — Página de venta larga. CTA repetido 5× "Me interesa visitarlo".
2. **P1 — Presupuesto:** "Nuestros terrenos parten desde $70 millones. ¿Esto está dentro del presupuesto que estás manejando?" → *Sí, podría ser* / *No, mi presupuesto es menor a $60 millones*.
3. **P2 — Plazo:** "¿Cuándo planeas hacer realidad tu proyecto?" → 3 meses / 6 meses / un año o más.
4. **P3 — Intención:** "Nuestras parcelas están listas para construir... ¿Te interesa conocerlas ya?" → *Quisiera hacer unas consultas antes* / *Sí, me gustaría visitarlas*.
5. **Form Agendamiento** ("Sí, visitarlas"): "Último paso: agenda tu visita al proyecto" → Nombre, Celular, Email, check privacidad.
6. **Form Contacto** ("consultas antes"): "¡Estás a un paso! Déjanos tus datos..." → mismos campos.
7. **Resultados:** *Agendamiento OK* / *Contacto OK* / *No calificado por presupuesto* (salida cordial).

---

## Validación de la hipótesis del cliente

> Hipótesis: "el copy no está hablando el idioma del buyer persona / no nos estamos identificando con el perfil".

**CONFIRMADA, y con evidencia concreta.** El buyer persona documentado en `business.md` y `offer-angles.md` es **perfil minero, aspiracional**: jornadas largas en el desierto, estrés, deseo de un **refugio propio** en la naturaleza, "trabajas duro → lo mereces". Ese lenguaje **no aparece en ninguna parte de la página**.

La página habla en **voz de desarrolladora** (features + "exclusivo/boutique") en lugar de **voz del comprador** (identidad + escape + merecimiento). El comprador no se ve reflejado.

| Lo que dice la página | Lo que el persona necesita oír (ya extraído en offer-angles.md) |
|---|---|
| "Tu hogar soñado", "futuro hogar", "vivir en el Valle" | "Tu refugio", "algo tuyo", "para tu familia" — el minero probablemente compra **refugio/inversión/2° hogar**, no se está mudando |
| "Proyecto boutique exclusivo" (×6 "exclusivo") | "Trabajas duro. Mereces esto." / "Escapa del ritmo minero" / "Del desierto a tu propio valle" |
| "Familias que buscan tranquilidad y privacidad" (genérico) | Identidad específica del perfil minero/aspiracional |

Además, repetir "exclusivo/boutique/exclusividad" sin prueba, junto al precio de $70M, puede leerse como **gatekeeping** ("no es para mí") en lugar de aspiración ganada. El ángulo aspiracional funciona cuando se **merece** ("trabajas duro"), no cuando se **excluye**.

---

## Diagnóstico del 3% de clic en el CTA

El 3% es producto de **tres factores que se suman**, en orden de impacto probable:

1. **Precio primero, deseo después (filtro en el momento equivocado).** El H1 abre con "$70 millones" antes de construir deseo, identidad o confianza. El visitante frío se autoexcluye antes de involucrarse. Parte de esto es calificación deliberada — pero está filtrando por **precio antes de dar una razón para quererlo**. Califica por precio **después** de construir deseo, no antes.
2. **El copy no le habla al comprador** (hipótesis confirmada arriba). Cero lenguaje del persona. El minero no se identifica → no hay gancho emocional en la primera pantalla.
3. **Cero confianza/prueba en la página.** Decisión de $70M con cero prueba social, sin "proyecto anterior 100% vendido" (disponible en offer-angles.md), sin autoridad del equipo, y con **links legales placeholder**. Incluso un comprador calificado e interesado duda al hacer clic porque no hay andamiaje de credibilidad.

**Factor adicional:** el CTA "Me interesa visitarlo" pide un compromiso alto (visitar un terreno) a alguien que llegó hace 10 segundos. Un primer paso más blando ("Ver las 10 parcelas y precios", "Quiero conocer el proyecto") podría subir el clic, manteniendo la calificación **dentro** del funnel.

> Nota de balance: parte del bajo clic es **calificación por diseño** y es esperable en un ticket de $70M. El objetivo no es inflar clics de gente que no puede comprar, sino dejar de **filtrar por precio antes de generar deseo** y **conectar con quien sí es el perfil**.

---

## Hallazgos por módulo

### Structural (D01–D12) — 48%
- **FAIL — Prueba social ausente.** Cero testimonios/reseñas pese a tener munición (proyecto anterior 100% vendido, "El mejor proyecto del Elqui" 5★). Crítico para ticket alto.
- **FAIL — Señales de confianza ausentes.** Sin autoridad del equipo/empresa, sin garantías visibles.
- **WARN/FAIL — Risk removers fuertes ausentes.** "Rol propio" y "transferencia inmediata" (los desactivadores de objeción más potentes del mercado de parcelas chileno, ya identificados en offer-angles.md) **no están en la página**.
- **WARN — Hero (test 5 seg).** Claro QUÉ es, pero abre con precio + voz genérica; falta gancho de identidad.
- **WARN — CTA.** "Me interesa visitarlo" repetido 5× con mismo label; compromiso alto, sin micro-sí previo.
- **WARN — Beneficios feature-listed** (servicios, ubicación) sin traducir a beneficio emocional para el persona.
- **WARN — Urgencia incompleta.** Existe tramo de precio ($70M primeras 3 → $76M las 7) pero el ángulo emocional "el primero elige su terreno" y el bono concreto están diluidos.
- **PASS — Oferta completa** (qué, precio, dónde, USPs, CTA presentes).

### Message Match (D13–D16) — 50%
- **FAIL — Voz/persona.** Ver validación de hipótesis. Voz de desarrolladora, no del comprador.
- **WARN/FAIL — Encaje de caso de uso.** "Hogar/vivir" vs. probable "refugio/inversión/2° hogar".
- **PASS — Match de keyword ad→LP.** "Parcelas / Valle del Elqui" presente en H1 (coincide con "parcelas elqui").
- **PASS — Consistencia visual.** Tema verde de marca + imágenes drone del valle, coherente.

### Technical (D17–D24, parcial) — 55%
- **FAIL — `<html lang="en-US">`** en una página 100% en español (SEO, accesibilidad, lectores de pantalla, traducción automática).
- **FAIL — Links legales placeholder.** "Términos" y "Política de privacidad" → `https://vorlage.perspective.co/placeholder-en/` (plantilla, en otro idioma). Y el formulario **obliga** a aceptar "política de privacidad" cuyo link no existe → riesgo de confianza y legal.
- **WARN/FAIL — Formulario en inglés residual.** En la página de contacto hay una variante de formulario sin terminar en inglés ("What's the best way to reach you?", "Your name/email/phone", "I have read and accept the privacy policy"). Revisar que no se renderice al usuario.
- **WARN — Sin barra de progreso** (`showProgressBar: false`) en funnel de 4–5 pasos → el usuario no sabe cuánto falta → abandono.
- **WARN — Typo en meta description:** "Valle del Elquidesde $70 millones" (falta espacio); también en og:description.
- **No medido — Velocidad / Core Web Vitals.** Requiere Lighthouse/DevTools (no disponible esta corrida).
- **PASS — Mobile-first** (viewport correcto, formato funnel adecuado a móvil).
- **PASS — Formularios** con campos razonables (nombre, celular, email, privacidad).

---

## Nota de medición (corregida)

El agendamiento **sí se mide como evento distinto**: el `Schedule` se envía desde el **CRM como conversión offline vía CAPI** (server-side) y funciona. Por lo tanto Meta **sí puede optimizar por agendamientos**; el límite real es el **bajo volumen** (8 en 25 días), no la señal.

- Aclaración: los eventos del **Pixel en página** (`Lead` en ambas páginas de gracias —agendamiento `page_yzv733` y contacto `page_rblak7`— y `ViewContent` en los formularios) son señal browser-side y **no** son el evento de optimización del agendamiento.
- Limpieza opcional (baja prioridad, cosmética): diferenciar el `Lead` browser-side entre agendamiento y contacto para reportería más limpia. No afecta la optimización, que corre por CAPI.

## Hallazgo de mecánica del funnel

- El formulario de agendamiento promete "**agenda tu visita**" y la página de gracias dice "Tu visita fue **agendada con éxito**", pero el formulario **no tiene calendario/selección de fecha** — solo captura nombre/celular/email; la fecha se coordina después (y el `Schedule` se confirma en el CRM → CAPI offline). Hay una brecha promesa-mecánica ("agendada" sin haber elegido fecha). **Opción a evaluar:** un calendario self-serve podría subir agendamientos efectivos, pero validar primero contra el flujo comercial actual (puede que la coordinación manual sea intencional para calificar).
- **Doble fricción por precio al inicio:** precio en el H1 + pregunta de presupuesto como primer paso tras el clic. Bueno para calidad, pero front-loaded; mover/suavizar la pregunta de presupuesto tras construir valor ayudaría al volumen de agendamientos calificados.

---

## Fixes priorizados

| # | Prioridad | Fix | Impacto esperado | Ruta |
|---|-----------|-----|------------------|------|
| 1 | Alta | Reescribir copy en **voz del persona minero/aspiracional** (usar frases ya extraídas en offer-angles.md: "Trabajas duro. Mereces esto", "Escapa del ritmo minero", refugio vs hogar) | Sube clic en CTA + calidad de lead | lp-optimizer / landing-page-builder |
| 2 | Alta | Construir **deseo y confianza antes del precio**: mover prueba social arriba, reordenar para que el precio aparezca tras el valor | Sube clic en CTA | lp-optimizer |
| 3 | Alta | Agregar **prueba social y risk removers** (proyecto anterior 100% vendido, 5★, rol propio, transferencia inmediata) | Sube conversión en todo el funnel | landing-page-builder |
| 4 | Media | Considerar **calendario self-serve** en el paso de agendamiento (hoy la coordinación de fecha es manual; el `Schedule` ya entra al CRM y a Meta vía CAPI offline) | Puede subir agendamientos efectivos; validar con el flujo comercial actual | dev / GHL |
| 6 | Media | Arreglar `lang="es-CL"`, **links legales reales**, eliminar formulario en inglés residual, corregir typo meta | Confianza + legal + SEO | lp-optimizer / dev |
| 7 | Media | Activar **barra de progreso** y suavizar/reordenar la pregunta de presupuesto | Sube tasa de completación | dev / lp-optimizer |
| 8 | Baja | Probar CTA de **menor compromiso** ("Ver las 10 parcelas y precios") como variante A/B | Sube clic inicial | lp-optimizer |

---

## Lo que funciona (mantener)
- Oferta clara y transparencia de precios (tramos $70M/$76M, "sin intermediarios", "puedes cancelar el pie con tarjeta").
- Lógica de calificación bien pensada (presupuesto → plazo → intención) y salida cordial para no calificados.
- Formato mobile funnel adecuado y tema visual de marca coherente con la zona (verde/valle/drone).
- Match de keyword en H1.

---

*Generado por /lp-audit (lp-auditor) el 2026-06-10. Velocidad/CWV y performance por fuente no incluidos en esta corrida.*
