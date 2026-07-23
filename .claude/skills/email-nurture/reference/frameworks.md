# Email Copy Frameworks — Real Estate Nurturing

Frameworks operativos para la generación de copy en secuencias de nurturing inmobiliario. Cada tipo de email en `email-types.md` referencia el framework que aplica.

---

## Framework 1: Soap Opera Sequence (SOS)

**Origen:** Russell Brunson (DotCom Secrets) / André Chaperon (Autoresponder Madness)

**Cuándo usar:** Fase 1 — los primeros 5-7 emails tras el opt-in. El lead es nuevo, la relación es cero. El objetivo es crear engagement desde el primer email y construir una narrativa en serie que haga que abran cada email por curiosidad.

**Principio central:** Cada email termina con una razón para abrir el siguiente. No es una secuencia de emails — es una serie. Como una telenovela: el lector quiere saber qué pasa después.

### Los 5 emails SOS y su función

| Email | Nombre | Función | Elemento clave |
|-------|--------|---------|---------------|
| #1 | Set the Stage | Bienvenida + promesa | Establece quién eres, qué va a recibir y por qué importa. Crea anticipación para el #2 |
| #2 | High Drama | Backstory + conflicto | Historia relatable con tensión real. Cliffhanger obligatorio al cierre |
| #3 | Epifanía | Resolución + revelación | Resuelve el cliffhanger. Revela la idea central que cambia la perspectiva del lead |
| #4 | Beneficio oculto | Reencuadre | El ángulo que el lead no estaba considerando. Amplía o profundiza la epifanía |
| #5 | Urgencia suave + CTA | Cierre de fase | Resume el valor acumulado + siguiente paso natural. Sin presión artificial |

### Reglas del SOS

- **No vender en los primeros 3 emails.** El objetivo es la apertura del siguiente, no la conversión.
- **El hero es el lead, no el proyecto.** La historia del email #2 debe resonar con su situación, no ser un case study corporativo.
- **Cliffhanger real.** No "en el próximo email te cuento". Sí "lo que descubrí después cambió todo… pero antes de contarte, necesito que entiendas esto."
- **Tono íntimo.** El sender escribe como persona, no como empresa. Primera persona siempre.
- **Subject lines curiosidad.** Para el SOS, los mejores subjects son incompletos: crean una brecha de curiosidad que solo se cierra abriendo el email.

### Fórmula de apertura (email #1 SOS)

```
Hola {{contact.first_name}},

[Contexto de por qué están en contacto — 1 línea]

[Promesa específica de lo que van a recibir en esta secuencia — 2-3 líneas]

[Preview personal del sender — quién es, por qué importa su perspectiva — 2 líneas]

[Micro-CTA: algo pequeño para hacer ahora mismo — responder, guardar, leer algo]

[Cierre personal]
[Firma]

P.D. [Anticipo del email #2 — sin revelar, solo despertar curiosidad]
```

---

## Framework 2: Seinfeld Email Sequence

**Origen:** Ben Settle (Email Players)

**Cuándo usar:** Fase 2 y 3 — emails de nurturing de mediano y largo plazo. El lead ya pasó el SOS, la relación existe. El objetivo es mantener top-of-mind sin aburrir. Son emails "sobre nada" que siempre terminan con un punto relevante.

**Principio central:** Seinfeld era un show "sobre nada" — y fue el más visto de la historia. Los mejores emails de nurturing son iguales: parten de una observación cotidiana, una historia random, una curiosidad, y terminan con una idea relevante para el lead. Son entretenidos *además* de útiles.

### Estructura del Seinfeld Email

```
1. HOOK DE APERTURA (1-2 líneas)
   Una observación, anécdota o curiosidad que parece no tener nada que ver con real estate.
   Ej: "Vi una paloma en el aeropuerto que llevaba 20 minutos mirando la misma baldosa."

2. DESARROLLO DE LA HISTORIA (3-6 líneas)
   Expande la observación con detalles concretos. Hazla visual. Hazla humana.
   No fuerces la conexión todavía — deja que el lector se pregunte a dónde va esto.

3. PIVOT (1-2 líneas)
   La transición que conecta la historia con la lección.
   Frases de pivot: "Y pensé en algo.", "Lo que eso me hizo entender fue...",
   "Suena raro, pero hay algo de eso en cómo funciona [tema]."

4. LECCIÓN / INSIGHT (3-5 líneas)
   El punto real del email. Puede ser educativo, provocador, o simplemente interesante.
   Conecta con el mundo del lead y su proceso de decisión.

5. CTA (opcional, liviano)
   Solo si el insight lleva naturalmente a un próximo paso. No forzar.
   Ej: "Si te hace sentido, este simulador lo muestra con números reales: [link]"

6. FIRMA
```

### Reglas del Seinfeld Email

- **La historia debe ser real.** O al menos verosímil. La especificidad genera credibilidad.
- **No explicar el chiste.** Si la conexión entre la historia y la lección es obvia, no la digas. Si no es obvia, el pivot lo hace.
- **La lección no es siempre un sales pitch.** Puede ser un insight puro sin CTA. Eso construye confianza.
- **Frecuencia:** Funciona bien en cadencia de 1-2 por semana en fase 2, 2-4 por mes en fase 3.
- **Tono:** Más casual que el SOS. Más conversacional. Puede tener humor.

---

## Framework 3: The 9-Word Email

**Origen:** Dean Jackson

**Cuándo usar:** Reactivación de leads dormidos. Un lead que no ha abierto en semanas o meses. El objetivo es generar una respuesta simple — no una venta.

**Principio central:** El email más corto posible con el mayor poder de reactivación. Funciona porque no parece marketing. Parece un mensaje personal de alguien que se acuerda de ti.

### Estructura exacta

**Subject line:** `{Nombre del lead}` (solo el nombre, nada más)

**Body:**
```
¿Todavía estás interesado/a en [lo que el lead quería conseguir]?

[Firma — solo nombre]
```

**Ejemplo real:**
```
Subject: Gonzalo

¿Todavía estás buscando una propiedad de inversión en Matanzas?

— Carlos
```

### Reglas del 9-Word Email

- **Sin logo, sin imagen, sin banner.** Debe verse como un email escrito a mano por una persona.
- **Sin presión.** La pregunta es genuina. No "quedan solo 3 unidades".
- **Solo una pregunta.** Nada más.
- **Respuesta esperada:** "Sí, todavía estoy interesado" → deriva a seguimiento comercial. "No" → mueve a lista fría. Sin respuesta → va al email de breakup.
- **En GHL:** Usar inline styles mínimos. Sin tabla de marketing. Solo `<p>` con estilo básico. Ver variante en `html-template.md`.

---

## Framework 4: Lifecycle Nurture Architecture

**Origen:** Síntesis de Artifakt Digital, Email on Acid, Zendesk, Mailjet (ver investigación original)

**Cuándo usar:** Como mapa maestro del programa completo. Define cuándo enviar qué tipo de email y qué señales determinan el avance entre fases.

**Ver `sequence-architecture.md` para la implementación completa.**

### Las tres fases del programa

| Fase | Nombre | Emails | Cadencia | Objetivo |
|------|--------|--------|----------|---------|
| 1 | SOS — Onboarding | 5 emails | Cada 1-2 días | Crear engagement, establecer relación, primera conversión intentada |
| 2 | Nurture — Consolidación | 8-12 emails | 1 por semana | Educación, confianza, resolución de objeciones, calificación |
| 3 | Editorial — Largo plazo | Mensual/bimensual | Top-of-mind hasta que el lead esté listo | Persistencia sin presión, autoridad editorial |

### Señales de comportamiento → acciones

| Señal | Indica | Acción recomendada |
|-------|--------|-------------------|
| Abre todos los emails + clics en links financieros | Alto interés analítico | Aumentar cadencia. Enviar mini-caso financiero y simulador |
| Abre pero no clica | Interés pero no urgencia | Continuar secuencia. Cambiar CTA a bajo compromiso |
| No abre en 2-3 semanas | Fatiga o timing lejano | Activar secuencia de reactivación (9-Word) |
| Responde directamente al email | Intención real | Derivar a seguimiento comercial manual |
| No abre en 60 días | Dormido | Email de breakup. Si no responde → lista fría |

### Principio de edutainment humano

Aplicar en todos los emails:

- **Education:** Cada email deja al lead con algo que no sabía antes.
- **Entertainment:** La forma de contarlo debe ser interesante, no solo informativa.
- **Emotional Relief:** Reconocer la duda, el miedo o la incertidumbre del lead — no ignorarla.
- **Micro-Progress:** Cada email da un paso pequeño hacia adelante en la decisión del lead.

Un email que solo tiene uno de estos cuatro es bueno. Uno que tiene los cuatro es memorable.

---

## Fórmulas de subject line por tipo de email

### Subject lines de curiosidad (SOS, Seinfeld)
- `[Nombre], esto cambió cómo veo [tema]`
- `El error que casi todos cometen con [situación]`
- `Lo que nadie te dice sobre [tema]`
- `¿Por qué [acción común] casi nunca funciona?`
- `La historia de [persona genérica] y lo que aprendí`

### Subject lines de valor (Nurture educativo)
- `[Número] cosas que deberías saber antes de [decisión]`
- `Cómo calcular si una propiedad realmente conviene`
- `La diferencia entre [opción A] y [opción B] (con números reales)`
- `Guía rápida: [tema específico del segmento]`

### Subject lines de prueba social
- `Lo que [tipo de cliente] me dijo después de [resultado]`
- `"[Cita directa de un resultado]" — [nombre genérico, ciudad]`

### Subject lines de reactivación
- `{Nombre}` (9-Word email — solo el nombre)
- `¿Seguimos?`
- `Antes de cerrar esto...`
- `[Nombre], ¿cambiaron tus planes?`
