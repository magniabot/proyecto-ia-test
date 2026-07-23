# Sequence Architecture — Real Estate Email Nurturing

Arquitectura completa del programa de nurturing. Define qué emails van en cada fase, en qué orden, con qué timing, y cómo se conectan entre sí.

---

## Mapa general del programa

```
LEAD OPT-IN
     │
     ▼
┌─────────────────────────────────────┐
│   FASE 1: SOS — Onboarding          │
│   5 emails · 10 días                │
│   Objetivo: engagement + relación   │
└────────────────┬────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
   [Señal positiva]  [Sin señal / dormido]
        │                 │
        ▼                 ▼
┌───────────────┐  ┌──────────────────────┐
│ FASE 2:       │  │ REACTIVACIÓN:        │
│ Nurture       │  │ 9-Word + Seguimiento │
│ Consolidación │  │ + Breakup            │
│ 10 emails     │  │ 3 emails · 14 días   │
│ 90 días       │  └──────────────────────┘
└───────┬───────┘
        │
        ▼
┌─────────────────────────────────────┐
│   FASE 3: Editorial Evergreen       │
│   6+ emails · mensual/bimensual     │
│   Objetivo: top-of-mind de largo    │
│   plazo hasta que estén listos      │
└─────────────────────────────────────┘
```

---

## Fase 1 — SOS: Onboarding (5 emails)

**Duración total:** 10 días
**Trigger de inicio:** Lead opt-in (formulario, landing page, lead magnet)
**Objetivo:** Crear relación, establecer autoridad, primer intento de conversión suave

| # | Tipo | Timing | CTA Level | Notas |
|---|------|--------|-----------|-------|
| 01 | SOS #1 — Set the Stage | Día 0 (inmediato) | Mínimo | Bienvenida. Define expectativas. P.D. anticipa #2 |
| 02 | SOS #2 — High Drama | Día 2 | Ninguno | Historia + backstory + cliffhanger. Sin CTA |
| 03 | SOS #3 — Epifanía | Día 4 | Bajo | Resuelve cliffhanger. La revelación central |
| 04 | SOS #4 — Beneficio Oculto | Día 6 | Medio | Reencuadre. Primer contacto indirecto con el proyecto |
| 05 | SOS #5 — Urgencia Suave + CTA | Día 10 | Alto (pero sin presión) | Cierre natural. Primer CTA real |

**Reglas de la Fase 1:**
- No mencionar precio ni disponibilidad hasta el email #4 o #5.
- El sender escribe como persona, no como marca.
- Los primeros 3 emails son 100% narrativos / relacionales.
- Después del email #5: si el lead convirtió → seguimiento comercial. Si no → iniciar Fase 2.

---

## Fase 2 — Nurture: Consolidación (10 emails)

**Duración total:** ~90 días
**Trigger de inicio:** Después del email SOS #5, si no hubo conversión
**Cadencia:** 1 email por semana (aprox. cada 7 días)
**Objetivo:** Educación, confianza, resolución de objeciones, calificación por comportamiento

| # | Tipo | Timing | Ángulo recomendado | CTA Level |
|---|------|--------|--------------------|-----------|
| 06 | Error Común | Semana 1 | El error más costoso del segmento | Medio |
| 07 | Insight de Mercado | Semana 2 | Dato de mercado local + perspectiva personal | Bajo-Medio |
| 08 | Behind-the-Scenes | Semana 3 | Historia interna del proyecto o empresa | Mínimo |
| 09 | Mito + Desmontaje | Semana 4 | Mito financiero o del mercado del segmento | Medio |
| 10 | Mini-Caso Financiero | Semana 5 | Simulación numérica real para el segmento | Alto |
| 11 | Q&A del Equipo | Semana 6 | Pregunta frecuente del segmento, respondida directamente | Bajo |
| 12 | Guía de Zona | Semana 7 | Por qué esta ubicación. Data + narrativa | Medio |
| 13 | Prueba Social / Testimonio | Semana 8 | Cliente con perfil similar al segmento | Medio-Alto |
| 14 | Seinfeld — Insight editorial | Semana 10 | Historia random → lección de inversión/real estate | Mínimo |
| 15 | Insight de Mercado | Semana 12 | Actualización de mercado + CTA consultivo | Alto |

**Señales de comportamiento en Fase 2:**

| Señal | Acción |
|-------|--------|
| Abre todos + clics en #10 (mini-caso financiero) | Adelantar CTA en el siguiente email. Considerar rama comercial |
| Abre pero no clica en 3+ emails seguidos | Cambiar ángulo en el siguiente. Más narrativo, menos informativo |
| No abre en 3 semanas | Pausar Fase 2. Activar Secuencia de Reactivación |
| Responde directamente al email | Derivar a seguimiento comercial manual. Sacar de secuencia automática |

---

## Fase 3 — Editorial Evergreen (6+ emails / mensual)

**Duración:** Indefinida — hasta que el lead convierta, se dé de baja, o pase a lista fría
**Trigger de inicio:** Después de completar Fase 2 sin conversión
**Cadencia:** 2-4 emails por mes (sprints) o 1 por mes (modo mantenimiento)
**Objetivo:** Top-of-mind de largo plazo. El lead no está listo hoy, pero puede estarlo en 6-18 meses.

| Email | Tipo | Timing | Notas |
|-------|------|--------|-------|
| 16 | Newsletter Mensual de Mercado | Mensual | Resumen de mercado. 3 puntos. Ligero y útil |
| 17 | Seinfeld editorial | Mensual (alternado) | Historia entretenida + insight de inversión |
| 18 | Insight de Mercado (nueva data) | Cada 2 meses | Datos actualizados. Posiciona como experto |
| 19 | Nuevo proyecto / novedad | Cuando corresponda | Solo si hay algo genuinamente nuevo que contar |
| 20 | Testimonio o caso nuevo | Cada 2-3 meses | Nuevas historias de compradores con resultados |
| 21 | Q&A — nueva pregunta | Cada 2-3 meses | Nuevas preguntas del mercado o de otros leads |

**Reglas de la Fase 3:**
- Mantener la voz humana y personal. No convertirse en newsletter corporativo.
- La frecuencia puede reducirse a 1 por mes si el lead lleva más de 6 meses sin interacción.
- Incluir reactivación cada 60-90 días si el lead no abre.
- Un lead en Fase 3 puede regresar a Fase 2 si muestra nueva intención (visita landing, hace click en CTA).

---

## Secuencia de Reactivación (3 emails)

**Trigger:** Lead sin apertura de emails en 21+ días durante cualquier fase
**Objetivo:** Recuperar o cerrar la relación limpiamente

| # | Tipo | Timing | Notas |
|---|------|--------|-------|
| R1 | 9-Word Email | Día 0 | "¿Todavía estás interesado/a en [X]?" — Solo el nombre como subject |
| R2 | Follow-up de confirmación | Día 5 (si no abre R1) | "Quería asegurarme de que llegó mi mensaje" — 3-4 líneas |
| R3 | Email de Breakup | Día 12 (si no abre R2) | Cierre honesto. Sin presión. Puerta abierta |

**Después de la secuencia de reactivación:**
- Si responde a cualquier email → volver a Fase 2 (email #6) o derivar a comercial
- Si no responde al email de breakup → mover a lista fría o inactiva en GHL
- No eliminar el contacto — puede reactivarse solo en el futuro

---

## Secuencia completa — Vista consolidada

| # | Fase | Tipo | Timing acumulado | CTA |
|---|------|------|-----------------|-----|
| 01 | Fase 1 | SOS #1 Set the Stage | Día 0 | Mínimo |
| 02 | Fase 1 | SOS #2 High Drama | Día 2 | Ninguno |
| 03 | Fase 1 | SOS #3 Epifanía | Día 4 | Bajo |
| 04 | Fase 1 | SOS #4 Beneficio Oculto | Día 6 | Medio |
| 05 | Fase 1 | SOS #5 Urgencia Suave + CTA | Día 10 | Alto |
| 06 | Fase 2 | Error Común | Semana 3 | Medio |
| 07 | Fase 2 | Insight de Mercado | Semana 4 | Bajo-Medio |
| 08 | Fase 2 | Behind-the-Scenes | Semana 5 | Mínimo |
| 09 | Fase 2 | Mito + Desmontaje | Semana 6 | Medio |
| 10 | Fase 2 | Mini-Caso Financiero | Semana 7 | Alto |
| 11 | Fase 2 | Q&A del Equipo | Semana 8 | Bajo |
| 12 | Fase 2 | Guía de Zona | Semana 9 | Medio |
| 13 | Fase 2 | Prueba Social / Testimonio | Semana 10 | Medio-Alto |
| 14 | Fase 2 | Seinfeld Editorial | Semana 12 | Mínimo |
| 15 | Fase 2 | Insight de Mercado #2 | Semana 14 | Alto |
| 16+ | Fase 3 | Newsletter / Evergreen | Mensual | Variable |
| R1 | Reactivación | 9-Word Email | Según trigger | Mínimo |
| R2 | Reactivación | Follow-up | +5 días | Mínimo |
| R3 | Reactivación | Breakup | +12 días | Ninguno |

---

## Configuración GHL recomendada

**Workflow principal:**
```
Trigger: Tag agregado "Lead Nurturing - [Segmento]"
↓
[Email 01] → Wait 2 days
↓
[Email 02] → Wait 2 days
↓
[Email 03] → Wait 2 days
↓
[Email 04] → Wait 4 days
↓
[Email 05] → Wait 11 days
↓
[Email 06] → Wait 7 days
↓
... (continuar por fase)
```

**Workflow de reactivación:**
```
Trigger: "Lead no ha abierto email en 21 días" (configurar con GHL Smart Lists)
↓
[Email R1 — 9-Word] → Wait 5 days
↓
IF opened → Remove from reactivation, continue main sequence
IF not opened → [Email R2] → Wait 7 days
↓
IF opened → Remove from reactivation, continue main sequence
IF not opened → [Email R3 — Breakup] → Tag: "Lista Fría"
```

**Tags recomendados en GHL:**
- `Nurturing Activo - [Segmento]` — Lead en secuencia
- `Nurturing Fase 2 - [Segmento]` — En consolidación
- `Nurturing Fase 3 - [Segmento]` — En evergreen
- `Reactivacion - [Segmento]` — En proceso de reactivación
- `Lista Fría` — Sin respuesta a reactivación
- `Oportunidad Comercial` — Respondió / mostró intención alta
