---
name: setup
description: Configura el workspace desde cero en una máquina nueva — diagnostica qué falta, instala dependencias, configura la cuenta y verifica que todo funcione. Para onboarding de personas no técnicas. Use for setup, instalación, onboarding, configurar workspace, "no me funciona nada", primera vez.
argument-hint: "[check | deps | account | verify]"
---

# Setup — Puesta en marcha del workspace

Convierte el proceso de instalación en una conversación. La persona no lee documentación: responde preguntas y vos ejecutás.

**Público objetivo: alguien que no es técnico.** Nunca asumas que sabe qué es una terminal, npm, una variable de entorno o un ID de cuenta. Ejecutá vos todo lo que sea ejecutable.

---

## Alcance

| Sí hace | No hace |
|---|---|
| Diagnosticar qué falta | Obtener credenciales de Google Ads |
| Instalar dependencias | Instalar Node.js o Claude Code |
| Configurar la cuenta en el JSON | Aprobar el developer token |
| Verificar la conexión | |
| Detectar si falta contexto de negocio | |

> **Las credenciales de Google Ads son un proceso aparte**, gestionado fuera de este skill. Si faltan, informalo con claridad y seguí adelante con todo lo demás — no intentes guiar el flujo de OAuth ni pidas que las consigan ahora.

---

## Rutas

```
/setup            → Proceso completo (recomendado la primera vez)
/setup check      → Solo diagnóstico, sin tocar nada
/setup deps       → Solo instalar dependencias
/setup account    → Solo configurar la cuenta
/setup verify     → Solo probar la conexión
```

---

## Fase 0 — Diagnóstico (siempre primero)

```bash
node .claude/skills/setup/scripts/check-environment.js
```

Devuelve JSON tras `__SETUP_STATUS__`. Parsealo y quedate con:

- `node.ok` — versión suficiente
- `credentials.groups` — qué servicios están completos y cuáles no
- `account.ok` — si hay un customerId válido o quedó el placeholder
- `dependencies.pending` — skills sin instalar
- `context.ok` — si existe business.md
- `blockers` — lista de impedimentos reales

**Presentá el resultado en lenguaje humano**, no volcando el JSON:

> "Revisé tu equipo. Node.js está bien. Falta instalar las dependencias de 13 skills y configurar cuál es la cuenta a gestionar. Las credenciales de Google Ads ya están cargadas. Empiezo por las dependencias — tarda unos minutos."

Si `ready` es `true` y no hay nada pendiente, decilo y ofrecé el primer paso real de trabajo (`/gads-context`).

---

## Fase 1 — Dependencias

Solo si `dependencies.pending` no está vacío.

Avisá antes de empezar: **tarda varios minutos** y `competitor-scraper` descarga un navegador completo (~200 MB). Sin ese aviso, parece que se colgó.

**Windows (PowerShell):**
```powershell
Get-ChildItem .claude/skills/*/scripts/package.json | ForEach-Object {
    Push-Location $_.Directory
    npm install --silent
    Pop-Location
}
```

**Mac / Linux:**
```bash
for d in .claude/skills/*/scripts; do
  [ -f "$d/package.json" ] || continue
  (cd "$d" && npm install --silent)
done
```

Corrélo en segundo plano y avisá cuando termine.

Si la persona tiene apuro o poca conexión, ofrecé la instalación mínima —`gads-context`, `keyword-auditor`, `search-term-auditor`— que alcanza para trabajar Google Ads. El resto se instala después.

Si `npm` falla por permisos o red, reportá el error tal cual y no reintentes en bucle.

---

## Fase 2 — Credenciales (solo verificación)

No guíes la obtención. Limitate a informar el estado:

- **Google Ads completo** → "Las credenciales de Google Ads están cargadas."
- **Google Ads incompleto** → "Faltan credenciales de Google Ads: {lista}. Ese trámite se gestiona por separado; cuando las tengas, las cargo yo en el archivo."
- **Otros servicios incompletos** → mencionalo solo si la persona va a usar esos skills. Meta, GHL o DataForSEO incompletos **no bloquean** el trabajo con Google Ads.

Si `credentials.fileExists` es `false`, creá el archivo desde la plantilla:

```bash
cp config/.env.example config/.env      # Mac/Linux
Copy-Item config/.env.example config/.env   # Windows
```

Si la persona te dicta o pega una credencial, escribila vos en `config/.env` con Edit.

**Nunca leas `config/.env` ni muestres su contenido.** El script de diagnóstico ya reporta qué falta sin exponer valores — usá eso.

---

## Fase 3 — Configurar la cuenta

Solo si `account.ok` es `false` o hay placeholders.

Necesitás dos datos. Pedilos **de a uno** y explicá dónde encontrarlos:

1. **Nombre del cliente** — como quiera identificarlo.

2. **ID de cuenta de Google Ads** (`customerId`)
   > "Es el número de 10 dígitos que aparece arriba a la derecha en Google Ads, con este formato: 123-456-7890. Pasámelo como lo ves, yo le saco los guiones."

3. **ID de la cuenta administradora** (`loginCustomerId`)
   > "¿Entrás a esta cuenta desde una cuenta administradora (MCC)? Si no sabés o entrás directo, uso el mismo número."

Escribí los valores en `config/ads-context.config.json` → bloque `googleAds`, quitando guiones de los IDs.

---

## Fase 4 — Verificar

Probá la conexión real:

```bash
node .claude/skills/gads-context/scripts/query.js \
  --customer-id={customerId} \
  --login-customer-id={loginCustomerId} \
  --query="SELECT campaign.id, campaign.name, campaign.status FROM campaign" \
  --no-date-range --allow-empty \
  --output={scratchpad}/setup-test.csv
```

**Interpretá el resultado en lenguaje humano:**

| Resultado | Qué significa | Qué decir |
|---|---|---|
| Filas > 0 | Todo funciona | "Conecté con la cuenta. Encontré N campañas." |
| 0 filas, sin error | Conecta pero no hay campañas activas | "La conexión funciona. No hay campañas activas en este momento." |
| `DEVELOPER_TOKEN_NOT_APPROVED` | Token pendiente de aprobación | Es parte del proceso de credenciales, gestionado aparte |
| `CUSTOMER_NOT_ENABLED` / `USER_PERMISSION_DENIED` | La MCC no tiene acceso a esa cuenta | Verificar permisos, o que el `loginCustomerId` sea correcto |
| `invalid_grant` | Refresh token vencido o revocado | Requiere renovar credenciales — proceso aparte |

Nunca muestres el error crudo sin traducirlo.

---

## Fase 5 — Contexto de negocio

Si `context.ok` es `false` o `hasUnitEconomics` es `false`, explicá por qué importa:

> "Falta cargar el contexto del negocio: objetivos, márgenes, cuánto vale un lead. Sin eso puedo traer datos, pero no puedo decirte si un costo por lead de $30.000 es bueno o malo — depende de cuánto ganás por venta. ¿Lo completamos ahora? Son unas preguntas."

Y derivá a `/business-context-gatherer`.

Este paso es el que más impacto tiene sobre la calidad de todo lo que venga después. No lo presentes como opcional.

---

## Cierre

Cuando no queden bloqueantes:

1. Resumí qué quedó configurado, en una línea por punto
2. Nombrá lo que quedó pendiente y por qué no bloquea
3. Proponé el primer paso real de trabajo:

```
/gads-context        → traer los datos de la cuenta
/account-changelog   → ver los cambios recientes
```

---

## Cómo comunicar

- **Ejecutá, no instruyas.** Nunca digas "corré este comando" si lo podés correr vos.
- **Una pregunta por vez.** Nada de formularios con cinco campos.
- **Sin jerga.** No es "el customerId del config", es "el número de la cuenta de Google Ads".
- **Avisá antes de lo lento.** Un `npm install` de varios minutos sin aviso parece un cuelgue.
- **Traducí los errores.** `USER_PERMISSION_DENIED` no significa nada para quien no es técnico.
- **Nunca dejes a la persona sin próximo paso.** Aun cuando algo esté bloqueado, siempre hay algo que sí se puede avanzar.
