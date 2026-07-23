#!/usr/bin/env node

/**
 * Setup — Diagnóstico de entorno
 *
 * Detecta qué falta para que el workspace sea operativo:
 * versión de Node, dependencias instaladas, credenciales
 * configuradas, cuenta configurada y contexto de negocio.
 *
 * SEGURIDAD: este script NUNCA lee ni imprime valores de
 * config/.env. Solo reporta qué nombres de variable están
 * presentes y si tienen algún valor asignado. Los valores
 * jamás se almacenan en memoria ni se emiten.
 *
 * Uso:
 *   node .claude/skills/setup/scripts/check-environment.js
 *
 * Salida: JSON tras la línea __SETUP_STATUS__
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Descubrir la raíz del proyecto subiendo desde la ubicación del script
let projectRoot = __dirname;
while (projectRoot !== resolve(projectRoot, '..') && !existsSync(resolve(projectRoot, 'config'))) {
    projectRoot = resolve(projectRoot, '..');
}

const report = {
    projectRoot,
    node: {},
    credentials: {},
    account: {},
    dependencies: {},
    context: {},
    blockers: [],
    ready: false,
};

// ─────────────────────────────────────────────────────────────
// 1. Versión de Node
// ─────────────────────────────────────────────────────────────

const nodeVersion = process.versions.node;
const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
report.node = {
    version: nodeVersion,
    major: nodeMajor,
    ok: nodeMajor >= 18,
};
if (!report.node.ok) {
    report.blockers.push(`Node.js ${nodeVersion} es demasiado antiguo. Se requiere 18 o superior.`);
}

// ─────────────────────────────────────────────────────────────
// 2. Credenciales — SOLO nombres, NUNCA valores
// ─────────────────────────────────────────────────────────────

const envPath = resolve(projectRoot, 'config/.env');
const examplePath = resolve(projectRoot, 'config/.env.example');

/**
 * Devuelve un mapa {NOMBRE: tieneValor}. El valor en sí se
 * descarta inmediatamente y nunca sale de esta función.
 */
function readKeyNames(filePath) {
    if (!existsSync(filePath)) return null;
    const names = {};
    for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 1) continue;
        const name = line.slice(0, eq).trim();
        if (!/^[A-Z0-9_]+$/i.test(name)) continue;
        // Solo booleano: ¿hay algo después del '='? El valor se descarta.
        names[name] = line.slice(eq + 1).trim().length > 0;
    }
    return names;
}

const envKeys = readKeyNames(envPath);
const exampleKeys = readKeyNames(examplePath) || {};

const GROUPS = {
    'Google Ads': ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_REFRESH_TOKEN'],
    'Meta Ads': ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PIXEL_ID', 'FACEBOOK_PAGE_ID', 'INSTAGRAM_ACCOUNT_ID'],
    'GoHighLevel': ['GHL_API_KEY', 'GHL_LOCATION_ID', 'GHL_IDENTIFICADOR_SECRETO'],
    'DataForSEO': ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
    'Modelos de lenguaje': ['OPENAI_API_KEY', 'GEMINI_API_KEY'],
};

report.credentials.fileExists = envKeys !== null;
report.credentials.exampleExists = existsSync(examplePath);
report.credentials.groups = {};

if (envKeys === null) {
    report.blockers.push('No existe config/.env — hay que crearlo desde config/.env.example');
} else {
    for (const [group, keys] of Object.entries(GROUPS)) {
        const configured = keys.filter(k => envKeys[k] === true);
        const empty = keys.filter(k => envKeys[k] === false);
        const missing = keys.filter(k => !(k in envKeys));
        report.credentials.groups[group] = {
            total: keys.length,
            configured: configured.length,
            pending: [...empty, ...missing],
            complete: configured.length === keys.length,
        };
    }
    if (!report.credentials.groups['Google Ads'].complete) {
        report.blockers.push('Faltan credenciales de Google Ads: ' + report.credentials.groups['Google Ads'].pending.join(', '));
    }
}

// ─────────────────────────────────────────────────────────────
// 3. Configuración de cuenta
// ─────────────────────────────────────────────────────────────

const configPath = resolve(projectRoot, 'config/ads-context.config.json');
const PLACEHOLDERS = ['act_your_ad_account_id', 'your_customer_id', 'Nombre del cliente', 'competitor1.com'];

if (!existsSync(configPath)) {
    report.account = { fileExists: false, ok: false };
    report.blockers.push('No existe config/ads-context.config.json');
} else {
    let cfg = {};
    try { cfg = JSON.parse(readFileSync(configPath, 'utf8')); } catch (e) {
        report.blockers.push('config/ads-context.config.json tiene JSON inválido: ' + e.message);
    }
    const g = cfg.googleAds || {};
    const isPlaceholder = v => !v || PLACEHOLDERS.some(p => String(v).includes(p));
    report.account = {
        fileExists: true,
        customerId: g.customerId || null,
        loginCustomerId: g.loginCustomerId || null,
        clientName: g.clientName || null,
        customerIdOk: !isPlaceholder(g.customerId),
        clientNameOk: !isPlaceholder(g.clientName),
        ok: !isPlaceholder(g.customerId),
    };
    if (!report.account.ok) {
        report.blockers.push('config/ads-context.config.json no tiene un customerId válido');
    }
}

// ─────────────────────────────────────────────────────────────
// 4. Dependencias por skill
// ─────────────────────────────────────────────────────────────

const skillsDir = resolve(projectRoot, '.claude/skills');
const installed = [];
const pending = [];

if (existsSync(skillsDir)) {
    for (const skill of readdirSync(skillsDir)) {
        const scriptsDir = join(skillsDir, skill, 'scripts');
        const pkgPath = join(scriptsDir, 'package.json');
        if (!existsSync(pkgPath)) continue;
        let pkg = {};
        try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { continue; }
        const deps = Object.keys(pkg.dependencies || {});
        if (deps.length === 0) continue;   // usa las dependencias de otro skill
        if (existsSync(join(scriptsDir, 'node_modules'))) installed.push(skill);
        else pending.push({ skill, deps });
    }
}

report.dependencies = {
    installed: installed.sort(),
    pending: pending.map(p => p.skill).sort(),
    installedCount: installed.length,
    pendingCount: pending.length,
    // gads-context es el núcleo: su query.js lo usan casi todos los auditores
    coreInstalled: installed.includes('gads-context'),
};
if (!report.dependencies.coreInstalled) {
    report.blockers.push('Falta instalar las dependencias de gads-context (núcleo del workspace)');
}

// ─────────────────────────────────────────────────────────────
// 5. Contexto de negocio
// ─────────────────────────────────────────────────────────────

const businessPath = resolve(projectRoot, 'context/business.md');
if (!existsSync(businessPath)) {
    report.context = { businessExists: false, ok: false };
    report.blockers.push('No existe context/business.md — los auditores no pueden evaluar sin él');
} else {
    const raw = readFileSync(businessPath, 'utf8');
    // Marcadores de campos sin completar
    const unfilled = (raw.match(/^\s*[-*]?\s*[^\n:]{0,60}:\s*—\s*$/gm) || []).length;
    report.context = {
        businessExists: true,
        sizeKb: Math.round(raw.length / 1024 * 10) / 10,
        unfilledFields: unfilled,
        hasUnitEconomics: /break-?even|margen|close rate|lead-to-close|valor por lead/i.test(raw),
        ok: raw.length > 500,
    };
}

// ─────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────

report.ready = report.blockers.length === 0;

const tick = ok => (ok ? 'OK  ' : '--  ');
console.log('\nDiagnóstico del workspace');
console.log('─'.repeat(52));
console.log(`${tick(report.node.ok)}Node.js ${report.node.version}`);
console.log(`${tick(report.credentials.fileExists)}config/.env ${report.credentials.fileExists ? 'existe' : 'NO existe'}`);
if (report.credentials.groups) {
    for (const [g, s] of Object.entries(report.credentials.groups)) {
        console.log(`${tick(s.complete)}  ${g}: ${s.configured}/${s.total} configuradas`);
    }
}
console.log(`${tick(report.account.ok)}Cuenta configurada${report.account.clientName ? ` (${report.account.clientName})` : ''}`);
console.log(`${tick(report.dependencies.pendingCount === 0)}Dependencias: ${report.dependencies.installedCount} instaladas, ${report.dependencies.pendingCount} pendientes`);
console.log(`${tick(report.context.ok)}context/business.md`);
console.log('─'.repeat(52));
console.log(report.ready ? 'Workspace operativo.' : `${report.blockers.length} punto(s) pendiente(s).`);

console.log('\n__SETUP_STATUS__');
console.log(JSON.stringify(report, null, 2));
