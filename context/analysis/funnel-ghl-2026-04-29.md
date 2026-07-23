# Análisis de Embudo GHL — Agrícola (Vista Los Naranjos)

**Fecha:** 2026-04-29 (corregido tras validación)
**Período:** Últimos 30 días (2026-03-30 → 2026-04-29)
**Fuente:** GoHighLevel CRM (contactos + UTMs + conversaciones del agente IA)
**Dashboard interactivo:** `created/dashboards/funnel-ghl-2026-04-29.html`
**Data raw:** `context/crm/`

---

## ⚠️ Nota sobre versión anterior

La primera versión de este reporte indicaba que el agente IA solo contactaba al 29% de los leads. **Ese dato era incorrecto** (el endpoint de GHL `/conversations/search?contactId=X` no devuelve resultados directamente — hay que listar todas las conversaciones del location y cruzar). La data real:
- **100% de los leads tienen conversación con el agente IA** (62/62)
- **803 mensajes** intercambiados (no 179)

Esto cambia el diagnóstico: el cuello de botella **no es la cobertura**, es la **conversión de engagement en agendamiento**.

---

## TL;DR — los 4 hallazgos que importan

1. **El agente IA contacta al 100% de los leads** y genera buen engagement: 68% de los leads responde al menos 1 vez, y **50% (31 de 62) tiene conversaciones largas (5+ mensajes del lead)**. La maquinaria conversacional funciona.

2. **Pero solo 6.5% de los engaged se agendan** (2 de 31 conversaciones largas). El agente conversa pero no cierra. Aquí está el cuello de botella real.

3. **Google Ads no genera ni un solo agendamiento** (0 de 20). Los leads de Google Ads tienen 75% de tasa de respuesta (15/20) y mensajes promedio similares a Meta, pero ninguno cierra.

4. **El ratio outbound/inbound es 2:1** (534 outbound vs 269 inbound). El agente persigue mucho a leads que no responden — entre 7 y 12 follow-ups en algunos casos.

**Tasa real lead → agendado: 3.2%** (2 de 62) vs target ~33 conv/mes en business.md.

---

## 1. KPIs corregidos


| Métrica                                    | Valor      | Comentario                          |
| ------------------------------------------ | ---------- | ----------------------------------- |
| Contactos (30d)                            | 62         |                                     |
| Conversaciones del agente IA               | 62         | **100% cobertura**                  |
| Mensajes totales                           | 803        | avg 12.9 por contacto               |
| Mensajes inbound (lead → agente)           | 269        |                                     |
| Mensajes outbound (agente → lead)          | 534        | ratio 2:1 vs inbound                |
| Leads que respondieron al menos 1 vez      | 42 (68%)   | Buen engagement inicial             |
| Leads con 5+ mensajes (engaged)            | 31 (50%)   | Conversaciones reales               |
| **Agendamientos**                          | **2 (3%)** | **Cuello de botella**               |
| % conversación larga → agendamiento        | **6.5%**   | **2 de 31 engaged → agendados**     |


---

## 2. Embudo total


| Etapa              | Opps | %    |
| ------------------ | ---- | ---- |
| Nuevo Prospecto    | 52   | 85%  |
| Contacto Realizado | 7    | 12%  |
| **Agendado**       | **2** | **3%** |


**Avg mensajes por etapa:**

- Nuevo Prospecto: 12.2 msgs/contacto (alto engagement, no avanza)
- Contacto Realizado: 17.0 msgs/contacto (más profundo)
- Agendado: 25.0 msgs/contacto (más conversadores)

**Lectura:** los que avanzan en el pipeline conversaron más. Pero el 85% de oportunidades quedan en "Nuevo Prospecto" a pesar de tener 12+ mensajes en promedio.

---

## 3. Embudo por fuente UTM


| Fuente         | Total | Respondió | % resp. | Avg msgs | Agendado | % agend. |
| -------------- | ----- | --------- | ------- | -------- | -------- | -------- |
| **fb_ad**      | 39    | 27        | 69%     | ~13      | **2**    | **5.1%** |
| **adwords**    | 20    | 15        | 75%     | ~13      | **0**    | **0.0%** |
| Direct traffic | 1     | —         | —       | —        | 0        | 0%       |
| Social media   | 2     | —         | —       | —        | 0        | 0%       |


**Insight clave:** Google Ads tiene **mejor tasa de respuesta inicial** (75% vs 69% de Meta), pero **nadie cierra**. El problema con Google Ads no es la calidad del lead inicial — es que las conversaciones derivan a algo distinto que no termina en visita.

Esto invalida la sospecha original de que Google Ads atrae leads investigativos. **El problema es otro:** quizás el guion del agente no maneja bien la objeción típica de un lead que viene buscando "venta de terrenos" en Google.

---

## 4. Análisis del agente IA — qué funciona y qué no

### Lo que funciona ✓
- 100% cobertura — disparo de workflow OK
- 68% response rate — el primer mensaje sí engancha
- 50% conversaciones largas — el agente sostiene diálogos extensos
- Caso Oscar Jaramilo: agendamiento limpio en 15 min, manejo perfecto de objeción de fechas

### Lo que NO funciona ✗

**A. Bajo cierre desde conversación larga (6.5%)**
- 31 leads con 5+ inbound, solo 2 agendaron
- Patrones recurrentes en las que se caen:

  - **Patrón "te derivo a un ejecutivo"**: Jhony Machaca, Pablo Zarricueta — el agente promete handoff humano y nunca llega. Tag "asistencia requerida"
  - **Patrón "presupuesto bajo + insistir con visita"**: Paulo Rodríguez ($50-60M vs $75M precio) — agente intenta agendar 3 veces sin reconocer el gap económico
  - **Patrón "info técnica que el agente no tiene"**: reglamento de construcción (4 casas), restricciones específicas → "te envío después" sin follow-through
  - **Patrón "después de info clave, pregunta abierta"**: Susana Fernandez — agente da precio + bono y pregunta "¿te gust...?" en vez de cerrar con "¿te lo agendo el sábado?"
  - **Patrón "lead pide visita explícita y agente no toma"**: Camaticona ("Hola Buenos días hoy se puede realizar una visita") — el primer mensaje del lead es "agéndame" y no se agendó

**B. Persistencia excesiva (ratio 2:1 outbound/inbound)**
- En varias conversaciones el agente envía 6-12 mensajes seguidos sin respuesta del lead
- Caso típico: agente hace 1 follow-up, espera, hace 2do follow-up, espera, hace 3ro
- Sin control de fatiga del lead ni de cuándo descalificar

**C. "Contacto Realizado" sin trazo digital**
- 7 oportunidades en esta etapa avg 17 msgs (no es que no hablen)
- Pero el **agente dice "te contactará un ejecutivo"** y la oportunidad se mueve manualmente
- No hay seguimiento sistemático del handoff

---

## 5. Por campaña

| Campaña                                                          | Total | Respondió | Agendado | % agend. |
| ---------------------------------------------------------------- | ----- | --------- | -------- | -------- |
| Clientes Potenciales Sitio Web - Cbo - Vista Los Naranjos (Meta) | 16    | ~12       | **1**    | 6%       |
| Agrícola I Search I Nb I Vista Los Naranjos (Google)             | 16    | ~12       | 0        | 0%       |
| Clientes Potenciales - Vista Los Naranjos - Test (Meta)          | 16    | ~10       | 0        | 0%       |
| Otros (incluye `{{campaign.name}}` con tracking roto)            | 14    | —         | 1        | —        |


**Nota tracking:** un agendado (Sandra Cuevas) tiene UTMs `{{campaign.name}}`, `{{adset.name}}`, `{{ad.name}}` literales — hay un adset de Meta con URL parameters mal configurados.

---

## 6. Recomendaciones priorizadas (ACTUALIZADAS)

### 🔴 Prioridad 1 — esta semana (cerrar más conversaciones engaged)

**1.1. Mejorar el cierre del agente IA**
- **Cambio de prompt:** después de entregar info clave (precio, bono, ubicación), siguiente mensaje debe ser **cierre directo con horario propuesto** ("¿te agendo el sábado a las 10:00?") en vez de pregunta abierta
- **Regla "lead pide visita = agendar inmediatamente":** si el lead escribe "visita", "ir a ver", "conocer", "agendar" → saltar calificación y proponer horarios
- **Impacto estimado:** doblar la tasa de cierre desde conversación larga de 6.5% a ~13% recupera +2-3 agendamientos/mes

**1.2. SLA de handoff humano (cuando el agente derive a ejecutivo)**
- Definir notificación automática a persona específica
- SLA: respuesta humana en máximo 2 horas
- Fixear los 7 casos en "Contacto Realizado" — ¿alguien los retomó?

**1.3. Reparar URL parameters en Meta Ads**
- Identificar el adset con `{{campaign.name}}` literal
- Sandra Cuevas (uno de los 2 agendados) viene de ahí — perdimos atribución crítica

### 🟡 Prioridad 2 — próximas 2 semanas (mejora del agente)

**2.1. Calificación temprana de presupuesto**
- En primeros 2-3 turnos preguntar rango de presupuesto
- Si presupuesto < $60M → mensaje de descalificación educada o nurture ("te avisamos si bajamos precios"), NO seguir insistiendo con visita
- Liberar capacidad del agente para foco en leads cualificados

**2.2. Llenar gaps de información técnica**
- Reglamento de construcción (¿cuántas casas por parcela?)
- Restricciones específicas (recurrentes en conversaciones)
- Agregar al manual del agente para no decir "te envío después"

**2.3. Control de fatiga**
- Si el lead no responde después de 2 follow-ups → pausar 48h, no insistir
- Reducir ratio outbound/inbound de 2:1 a algo más balanceado

### 🟢 Prioridad 3 — próximo mes (estructural)

**3.1. Diagnosticar por qué Google Ads no cierra**
- Los leads sí tienen alto engagement (75% respuesta) pero 0% cierre
- Hipótesis nueva: ¿son leads de búsqueda más informativa que comercial? ¿O el flujo del agente no se adapta al contexto?
- Revisar conversaciones de los 20 leads de adwords — ¿qué piden? ¿qué los frena?

**3.2. Implementar tracking dinámico en Google Ads**
- URLs con `{keyword}`, `{creative}`, `{adgroupid}` para atribución completa
- Hoy todos los 20 tienen `utm_content="Venta de Terrenos"` (genérico)

**3.3. Completar el pipeline en GHL**
- Crear etapas: Visita Realizada / Negociación / Vendido / Perdido (con razón)
- Sin esto no hay close rate ni ROI

---

## 7. Targets vs realidad


| Métrica            | Target (business.md) | Actual (30d) | Gap         |
| ------------------ | -------------------- | ------------ | ----------- |
| Conversiones/mes   | ~33                  | 62 leads     | OK volumen  |
| Agendamientos/mes  | (no definido)        | 2            | —           |
| Target CPA         | $15.000 CLP          | —            | —           |


**Faltante:** definir target de **agendamientos/mes** y **% de visitas → cierre** en business.md.

**Estimación inicial** (a validar con cliente): si se logra 13% de cierre desde conversación larga (vs 6.5% actual), con 31 conversaciones largas/mes → 4 agendamientos. Para llegar a 8-10 agendamientos/mes hay que combinar:
- Mejor cierre del agente (objetivo: 15-20% de engaged → agendado)
- Más volumen de leads (subir a ~80-100/mes)
- Reactivar el funcionamiento del Google Ads (canal hoy desperdiciado)

---

## 8. Cómo usar el dashboard interactivo

Abrir `created/dashboards/funnel-ghl-2026-04-29.html` en cualquier navegador. No requiere servidor.

Tiene:
- 8 KPI cards arriba (cobertura, response rate, tasa de agendamiento, etc.)
- Embudo y engagement (gráficos)
- Embudo por fuente UTM
- Tabla detallada por fuente y campaña
- Timeline diario (leads + mensajes)
- **Tarjetas de los 2 agendados** con click para ver conversación completa
- **Tarjetas de las conversaciones largas que NO cerraron** — click para ver el diálogo y entender qué pasó
- Tabla de todos los contactos con filtro por fuente y búsqueda libre
- Click en cualquier "Ver →" abre la conversación completa con burbujas tipo chat (inbound/outbound)

**Para regenerar** con data nueva:
```
node .claude/skills/ghl-exporter/scripts/export-crm.js --days=30
node .claude/skills/ghl-exporter/scripts/refetch-messages.js
PYTHONIOENCODING=utf-8 python .claude/skills/ghl-exporter/scripts/build-dashboard.py
```

---

**Scripts y data:**
- Raw CSVs: `context/crm/contacts.csv`, `opportunities.csv`, `opportunities-with-utm.csv`, `conversations.csv`, `messages.csv`
- Extractor inicial: `.claude/skills/ghl-exporter/scripts/export-crm.js`
- Re-fetch correcto de mensajes: `.claude/skills/ghl-exporter/scripts/refetch-messages.js` (← usar este)
- Análisis funnel: `.claude/skills/ghl-exporter/scripts/analyze-funnel.py`
- Deep dive: `.claude/skills/ghl-exporter/scripts/deep-dive.py`
- Builder de dashboard: `.claude/skills/ghl-exporter/scripts/build-dashboard.py`
- Dashboard generado: `created/dashboards/funnel-ghl-2026-04-29.html`
