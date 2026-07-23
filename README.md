# PPCOS — Workspace de Google Ads y Meta Ads

Workspace de trabajo para gestión de campañas publicitarias, operado con [Claude Code](https://claude.com/claude-code).

Contiene **41 skills** de auditoría y optimización (Google Ads, Meta Ads, landing pages, copy, feeds), los archivos de contexto de negocio que alimentan las decisiones, y los outputs generados.

> **Este no es un proyecto de software.** Es un espacio de trabajo operativo. Los scripts existen para traer datos y aplicar cambios; el trabajo real ocurre conversando con Claude Code sobre el contenido de `context/`.

---

## Tabla de contenidos

1. [Requisitos previos](#1-requisitos-previos)
2. [Setup paso a paso](#2-setup-paso-a-paso)
3. [Cómo obtener cada credencial](#3-cómo-obtener-cada-credencial)
4. [Verificar que quedó bien](#4-verificar-que-quedó-bien)
5. [Estructura del proyecto](#5-estructura-del-proyecto)
6. [Flujo de trabajo típico](#6-flujo-de-trabajo-típico)
7. [Skills disponibles](#7-skills-disponibles)
8. [Reglas de seguridad](#8-reglas-de-seguridad)
9. [Problemas frecuentes](#9-problemas-frecuentes)

---

## 1. Requisitos previos

| Requisito | Versión | Verificar con |
|---|---|---|
| **Node.js** | 18 o superior | `node --version` |
| **npm** | Incluido con Node | `npm --version` |
| **Git** | Cualquiera reciente | `git --version` |
| **Claude Code** | CLI, app de escritorio o extensión IDE | — |

Si falta Node.js: descargarlo de [nodejs.org](https://nodejs.org) (versión LTS).

**Accesos que vas a necesitar** (según qué skills uses):

- Cuenta de Google Ads con permisos de lectura o administración
- Token de desarrollador de Google Ads (nivel básico alcanza para leer)
- Cuenta de Meta Business con acceso al ad account — *solo si usás los skills de Meta*
- API key de GoHighLevel — *solo si usás dashboards o secuencias de email*
- Cuenta de DataForSEO — *solo si usás el scraper de competidores*

---

## 2. Setup paso a paso

> ### 🚀 Vía rápida: dejá que Claude lo haga
>
> Si ya tenés **Node.js** y **Claude Code** instalados y el repositorio clonado, no hace falta que sigas los pasos manuales. Abrí el proyecto con Claude Code y escribí:
>
> ```
> /setup
> ```
>
> Diagnostica qué falta, instala las dependencias, configura la cuenta y verifica la conexión. Vos solo respondés preguntas.
>
> Los pasos de abajo son el detalle de lo que hace, por si preferís hacerlo a mano o necesitás entender qué pasó.

### Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/magniabot/proyecto-ia-test.git
cd proyecto-ia-test
```

### Paso 2 — Crear el archivo de credenciales

El archivo `config/.env` **no viene en el repositorio** (contiene secretos). Se crea a partir de la plantilla:

**En Windows (PowerShell):**
```powershell
Copy-Item config/.env.example config/.env
```

**En Mac o Linux:**
```bash
cp config/.env.example config/.env
```

Después abrí `config/.env` en un editor y completá los valores. La sección [3](#3-cómo-obtener-cada-credencial) explica de dónde sale cada uno.

> No hace falta completar todas. Solo las de los servicios que vayas a usar. Los skills que necesiten una credencial faltante van a avisar.

### Paso 3 — Instalar dependencias

Cada skill tiene sus propias dependencias en su carpeta `scripts/`. Este comando las instala todas de una vez:

**En Windows (PowerShell):**
```powershell
Get-ChildItem .claude/skills/*/scripts/package.json | ForEach-Object {
    Push-Location $_.Directory
    Write-Host "Instalando: $($_.Directory.Parent.Name)"
    npm install --silent
    Pop-Location
}
```

**En Mac o Linux:**
```bash
for d in .claude/skills/*/scripts; do
  [ -f "$d/package.json" ] || continue
  echo "Instalando: $(basename $(dirname $d))"
  (cd "$d" && npm install --silent)
done
```

Tarda unos minutos. `competitor-scraper` es el más lento porque instala Puppeteer (descarga un navegador completo, ~200 MB).

<details>
<summary><strong>Instalación mínima</strong> — si solo vas a trabajar con Google Ads</summary>

El skill `gads-context` es el núcleo: su script `query.js` es el que usan casi todos los auditores para consultar la API. Con estos tres alcanza para la mayor parte del trabajo:

```bash
cd .claude/skills/gads-context/scripts && npm install && cd -
cd .claude/skills/keyword-auditor/scripts && npm install && cd -
cd .claude/skills/search-term-auditor/scripts && npm install && cd -
```

Después instalá el resto a medida que los vayas necesitando.
</details>

### Paso 4 — Configurar la cuenta

Editar `config/ads-context.config.json` con los datos de la cuenta a gestionar:

```json
{
  "googleAds": {
    "customerId": "1234567890",
    "loginCustomerId": "0987654321",
    "clientName": "Nombre del cliente"
  }
}
```

- **`customerId`** — ID de la cuenta de Google Ads, sin guiones
- **`loginCustomerId`** — ID de la cuenta administradora (MCC). Si accedés directo sin MCC, poné el mismo valor que `customerId`

### Paso 5 — Abrir el workspace

```bash
claude
```

O abrí la carpeta desde la app de escritorio de Claude Code.

Al iniciar, Claude lee automáticamente `CLAUDE.md`, `context/business.md` y `context/account-changelog.md` para entender el estado de la cuenta antes de hacer nada.

---

## 3. Cómo obtener cada credencial

### Google Ads

Son cuatro valores y es el setup más laborioso. Se hace una sola vez.

| Variable | Dónde sale |
|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads → Herramientas → **Centro de API**. Con acceso *Básico* alcanza para leer y para la mayoría de las escrituras |
| `GOOGLE_ADS_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com) → Credenciales → Crear credencial → **ID de cliente de OAuth** (tipo: Aplicación de escritorio) |
| `GOOGLE_ADS_CLIENT_SECRET` | Se genera junto con el Client ID, en la misma pantalla |
| `GOOGLE_ADS_REFRESH_TOKEN` | Se obtiene autorizando la app una vez con el Client ID y Secret. Google documenta el flujo en su [guía de OAuth para Google Ads API](https://developers.google.com/google-ads/api/docs/oauth/overview) |

> El **token de desarrollador** se pide desde la cuenta MCC, no desde una cuenta individual. La aprobación puede demorar días hábiles.

### Meta Ads

| Variable | Dónde sale |
|---|---|
| `META_ACCESS_TOKEN` | [Meta for Developers](https://developers.facebook.com) → tu app → Herramientas → Explorador de la API Graph. Para uso continuo conviene un token de larga duración |
| `META_AD_ACCOUNT_ID` | Administrador de anuncios, en la URL o el selector de cuentas. Formato `act_XXXXXXXXX` |
| `META_PIXEL_ID` | Administrador de eventos → Orígenes de datos |
| `FACEBOOK_PAGE_ID` | Configuración de la página → Información |
| `INSTAGRAM_ACCOUNT_ID` | Cuenta de Instagram vinculada, vía la API Graph |

### GoHighLevel

| Variable | Dónde sale |
|---|---|
| `GHL_API_KEY` | GHL → Settings → **Business Profile** → API Key |
| `GHL_LOCATION_ID` | En la URL cuando estás dentro de la ubicación (location) |
| `GHL_IDENTIFICADOR_SECRETO` | Identificador interno de la instalación |

### DataForSEO

| Variable | Dónde sale |
|---|---|
| `DATAFORSEO_LOGIN` | Email de la cuenta en [dataforseo.com](https://dataforseo.com) |
| `DATAFORSEO_PASSWORD` | Password de API (no es la del panel — se genera aparte) |

### Modelos de lenguaje (opcional)

`OPENAI_API_KEY` y `GEMINI_API_KEY` los usa `competitor-scraper` para clasificar anuncios. Sin ellos, ese skill funciona con capacidad reducida.

---

## 4. Verificar que quedó bien

Probá la conexión con Google Ads trayendo la lista de campañas:

```bash
node .claude/skills/gads-context/scripts/query.js \
  --customer-id=TU_CUSTOMER_ID \
  --login-customer-id=TU_LOGIN_CUSTOMER_ID \
  --query="SELECT campaign.id, campaign.name, campaign.status FROM campaign" \
  --no-date-range \
  --output=/tmp/test.csv
```

Si devuelve `Rows: N` con N mayor a cero, está funcionando.

O simplemente, dentro de Claude Code:

```
/gads-context
```

---

## 5. Estructura del proyecto

```
├── CLAUDE.md                    Instrucciones de comportamiento para Claude
├── README.md                    Este archivo
├── config/
│   ├── .env                     Credenciales — NUNCA se versiona
│   ├── .env.example             Plantilla de credenciales
│   └── ads-context.config.json  Configuración de cuenta y umbrales
├── context/                     ← Fuente de verdad del negocio
│   ├── business.md              Objetivos, targets, economía unitaria, restricciones
│   ├── account-changelog.md     Cambios recientes en la cuenta
│   ├── brand.md                 Contexto de marca
│   ├── offer-angles.md          Ángulos de mensaje para copy
│   ├── google-ads/data/         CSVs con datos de la cuenta
│   ├── meta-ads/                Datos de Meta
│   ├── analysis/                Informes generados por los auditores
│   ├── memory/                  Registro operativo por fecha (YYYY-MM-DD.md)
│   └── SOP's/                   Procedimientos internos
├── created/                     ← Outputs listos para usar
│   ├── rsas/                    CSVs para importar en Google Ads Editor
│   ├── landing-pages/           Wireframes HTML
│   ├── dashboards/              Dashboards HTML
│   └── email-sequences/         Secuencias de email
└── .claude/
    ├── skills/                  41 skills de auditoría y optimización
    ├── rules/                   Reglas de contexto y logging
    └── hooks/                   Automatizaciones de sesión
```

**La regla que ordena todo:** `context/` es lo que Claude lee para decidir. `created/` es lo que produce para que vos uses. Si algo importante no está en `context/`, Claude no lo va a tener en cuenta.

---

## 6. Flujo de trabajo típico

### Al empezar con una cuenta nueva

```
1. /setup                        → deja el entorno operativo
2. /business-context-gatherer    → completa context/business.md con una entrevista
3. /ads-context-gatherer         → extrae contexto de marca desde el sitio web
4. /gads-context                 → trae los datos de la cuenta
5. /account-changelog            → trae los cambios recientes
```

Sin `business.md` completo —sobre todo la economía unitaria— los auditores no pueden juzgar si un CPA es bueno o malo. Es el primer paso, no un opcional.

### Sesión de trabajo habitual

```
1. /account-changelog            → si tiene más de 5 días
2. /gads-context                 → si los datos tienen más de 24 h
3. El auditor que corresponda    → /keyword-auditor, /bidding-auditor, etc.
4. El optimizador correspondiente → aplica cambios, siempre con aprobación previa
```

### Antes de tocar presupuestos o pujas

Revisar `context/account-changelog.md`. Si hubo cambios en los últimos 7 días, hay que tenerlos en cuenta antes de recomendar nada — la data puede estar reflejando un cambio reciente y no una tendencia.

---

## 7. Skills disponibles

### Auditores (diagnostican, no modifican nada)

| Skill | Qué audita |
|---|---|
| `/account-auditor` | Estructura, naming, configuración general |
| `/keyword-auditor` | Salud de keywords, duplicados, canibalización |
| `/search-term-auditor` | Términos de búsqueda, negativos, n-gramas |
| `/bidding-auditor` | Estrategias de puja, targets, fase de aprendizaje |
| `/budget-auditor` | Limitación por presupuesto, pacing, asignación |
| `/quality-score-auditor` | Quality Score y sus componentes |
| `/placement-auditor` | Emplazamientos y brand safety |
| `/geo-schedule-auditor` | Segmentación geográfica, horaria y demográfica |
| `/tracking-specialist` | Conversiones y medición |
| `/lp-auditor` | Landing pages |
| `/offer-auditor` | Calidad de la oferta |
| `/competitive-analyst` | Posición competitiva |
| `/feed-auditor` | Feed de Merchant Center |
| `/strategy-specialist` | Economía unitaria y viabilidad de objetivos |

### Optimizadores (aplican cambios vía API, con aprobación)

`/bidding-optimizer` · `/budget-optimizer` · `/keyword-optimizer` · `/search-term-optimizer` · `/placement-optimizer` · `/geo-schedule-optimizer` · `/lp-optimizer` · `/feed-optimizer`

> Todos funcionan con **dry-run primero**: muestran qué van a cambiar y esperan aprobación antes de tocar la cuenta.

### Generadores de contenido

`/rsa-maker` · `/meta-ads-copywriter` · `/meta-brief-maker` · `/landing-page-builder` · `/ecom-page-builder` · `/email-nurture` · `/offer-maker` · `/dashboard-global` · `/reporte-mensual`

### Datos y contexto

`/gads-context` · `/meta-context` · `/account-changelog` · `/business-context-gatherer` · `/ads-context-gatherer` · `/competitor-scraper`

### Puesta en marcha

`/setup` — diagnostica el estado del entorno, instala dependencias, configura la cuenta y verifica la conexión. Pensado para arrancar en una máquina nueva sin conocimientos técnicos.

```
/setup           Proceso completo
/setup check     Solo diagnóstico, no modifica nada
/setup deps      Solo instalar dependencias
/setup account   Solo configurar la cuenta
/setup verify    Solo probar la conexión
```

---

## 8. Reglas de seguridad

> Estas no son sugerencias.

- **`config/.env` nunca se versiona.** Ya está en `.gitignore`. Si por alguna razón llegara a un commit, la respuesta correcta es **rotar todas las credenciales**, no borrar el archivo. Sacar un secreto del historial de git de forma verificable es difícil.
- **Cada persona usa sus propias credenciales.** No se comparte un `.env` entre personas ni por chat, email o Drive.
- **El repositorio es privado y debe seguir siéndolo.** Contiene economía unitaria, márgenes, performance real de cuentas y procedimientos internos.
- **Los optimizadores modifican cuentas reales.** Revisá siempre el dry-run antes de aprobar. Un cambio de presupuesto o de puja tiene efecto inmediato sobre el gasto.

---

## 9. Problemas frecuentes

<details>
<summary><strong>«Cannot find module 'google-ads-api'»</strong></summary>

Falta instalar las dependencias de ese skill:

```bash
cd .claude/skills/NOMBRE-DEL-SKILL/scripts
npm install
```
</details>

<details>
<summary><strong>«DEVELOPER_TOKEN_NOT_APPROVED» o «CUSTOMER_NOT_ENABLED»</strong></summary>

El token de desarrollador no está aprobado todavía, o la cuenta MCC no tiene acceso a ese `customerId`. Verificá en Google Ads que la cuenta administradora tenga permisos sobre la cuenta que estás consultando.
</details>

<details>
<summary><strong>Una query devuelve 0 filas pero la cuenta tiene datos</strong></summary>

Causa habitual: las queries filtran por `campaign.status = 'ENABLED'`. Si las campañas están pausadas, no devuelven nada aunque tengan histórico.

Verificá el estado real:

```
SELECT campaign.name, campaign.status FROM campaign
```
</details>

<details>
<summary><strong>«invalid_grant» al autenticar</strong></summary>

El refresh token expiró o fue revocado. Hay que generar uno nuevo repitiendo el flujo de OAuth.
</details>

<details>
<summary><strong>Los informes salen sin contexto de negocio</strong></summary>

`context/business.md` está incompleto. Sin economía unitaria (margen, tasa de cierre, valor por lead), los auditores no pueden juzgar si una métrica es buena o mala.

Corré `/business-context-gatherer` para completarlo mediante una entrevista.
</details>

---

*Workspace operado con Claude Code. Ante dudas sobre un skill puntual, su documentación está en `.claude/skills/NOMBRE/SKILL.md`.*
