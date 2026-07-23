#!/usr/bin/env node

/**
 * GHL CRM Exporter — Agrícola Cachapoal
 *
 * Extrae desde Go High Level:
 *  - Contactos con UTM source/medium/campaign/content/term
 *  - Oportunidades con etapa de pipeline
 *  - Conversaciones del agente IA (mensajes inbound + outbound)
 *
 * Outputs en context/crm/:
 *   contacts.csv               — todos los contactos con UTMs
 *   opportunities.csv          — oportunidades + etapa de pipeline
 *   opportunities-with-utm.csv — join completo para atribución
 *   conversations.csv          — resumen de conversaciones por contacto
 *   messages.csv               — mensajes individuales (inbound/outbound)
 *
 * Usage:
 *   node export-crm.js
 *   node export-crm.js --days=30        # filtra a últimos 30 días (recomendado)
 *   node export-crm.js --dry-run        # verifica credenciales sin escribir
 *   node export-crm.js --skip-messages  # omitir extracción de conversaciones (más rápido)
 *
 * Credenciales en config/.env:
 *   GHL_API_KEY        Private Integration Token
 *   GHL_LOCATION_ID    Location ID de la sub-cuenta
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// ─── Project root resolution ──────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
let projectRoot = __dirname;
while (!existsSync(resolve(projectRoot, 'config')) && resolve(projectRoot, '..') !== projectRoot) {
    projectRoot = resolve(projectRoot, '..');
}

config({ path: resolve(projectRoot, 'config/.env') });

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc, arg) => {
    if (arg === '--dry-run') { acc['dry-run'] = true; return acc; }
    if (arg === '--skip-messages') { acc['skip-messages'] = true; return acc; }
    if (arg.includes('=')) {
        const eqIdx = arg.indexOf('=');
        acc[arg.slice(0, eqIdx).replace(/^--/, '')] = arg.slice(eqIdx + 1);
    }
    return acc;
}, {});

const isDryRun = args['dry-run'] === true;
const skipMessages = args['skip-messages'] === true;
const filterDays = args['days'] ? parseInt(args['days'], 10) : null;

// ─── Credentials ──────────────────────────────────────────────────────────────

const apiKey = process.env.GHL_API_KEY || process.env.GHL_IDENTIFICADOR_SECRETO;
if (!apiKey) {
    console.error('\nError: GHL_API_KEY no encontrada en config/.env');
    process.exit(1);
}

let locationId = process.env.GHL_LOCATION_ID;

// ─── API helpers ──────────────────────────────────────────────────────────────

const GHL_BASE = 'https://services.leadconnectorhq.com';
const HEADERS = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
};

// Conversaciones requieren versión más reciente
const HEADERS_CONV = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-04-15',
};

async function ghlGet(path, params = {}, customHeaders = HEADERS) {
    const url = new URL(`${GHL_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), { headers: customHeaders });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`GHL API ${res.status} en ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
}

// ─── Fetch contacts ───────────────────────────────────────────────────────────

async function fetchAllContacts(cutoff) {
    console.log('\nFetching contacts...');
    const contacts = [];
    let startAfter = null;
    let startAfterId = null;
    let page = 1;
    let stop = false;

    while (!stop) {
        const params = { locationId, limit: 100 };
        if (startAfter) params.startAfter = startAfter;
        if (startAfterId) params.startAfterId = startAfterId;

        const data = await ghlGet('/contacts/', params);
        const batch = data.contacts || [];

        for (const c of batch) {
            const date = new Date(c.dateAdded || c.createdAt);
            if (cutoff && date < cutoff) {
                stop = true;
                break;
            }
            contacts.push(c);
        }

        process.stdout.write(`\r  Contactos listados: ${contacts.length} (página ${page})`);

        if (stop) break;
        if (batch.length < 100) break;

        const last = batch[batch.length - 1];
        const rawDate = last.dateAdded || last.createdAt;
        startAfter = rawDate ? new Date(rawDate).getTime() : null;
        startAfterId = last.id;

        if (!startAfter) break;
        page++;
        if (page > 500) break;
    }

    console.log(`\n  Enriqueciendo ${contacts.length} contactos con attributionSource...`);

    const enriched = [];
    const BATCH = 5;
    for (let i = 0; i < contacts.length; i += BATCH) {
        const slice = contacts.slice(i, i + BATCH);
        const details = await Promise.all(
            slice.map(c => ghlGet(`/contacts/${c.id}`).then(d => d.contact || c).catch(() => c))
        );
        enriched.push(...details);
        process.stdout.write(`\r  Enriquecidos: ${Math.min(i + BATCH, contacts.length)}/${contacts.length}`);
    }

    console.log(`\n  Total contactos: ${enriched.length}`);
    return enriched;
}

async function fetchAllOpportunities(cutoff) {
    console.log('\nFetching opportunities (filtrado por updatedAt)...');
    const opportunities = [];
    let page = 1;
    let totalScanned = 0;

    while (true) {
        const params = { location_id: locationId, limit: 100, page };
        const data = await ghlGet('/opportunities/search', params);
        const batch = data.opportunities || [];
        if (batch.length === 0) break;

        for (const o of batch) {
            totalScanned++;
            const updateDate = new Date(o.dateAdded || o.updatedAt || o.createdAt);
            if (cutoff && updateDate < cutoff) continue;
            opportunities.push(o);
        }

        process.stdout.write(`\r  Opps escaneados: ${totalScanned} | dentro del período: ${opportunities.length} (página ${page})`);

        if (batch.length < 100) break;
        if (!data.meta?.total || totalScanned >= data.meta.total) break;

        page++;
        if (page > 500) break;
    }

    console.log(`\n  Total oportunidades escaneadas: ${totalScanned}`);
    console.log(`  Oportunidades con actividad en el período: ${opportunities.length}`);
    return opportunities;
}

async function fetchPipelines() {
    console.log('\nFetching pipelines...');
    const data = await ghlGet('/opportunities/pipelines', { locationId });
    return data.pipelines || [];
}

// ─── Conversations ────────────────────────────────────────────────────────────

async function fetchConversationsForContact(contactId) {
    try {
        const data = await ghlGet('/conversations/search', {
            locationId,
            contactId,
            limit: 100,
        }, HEADERS_CONV);
        return data.conversations || [];
    } catch (err) {
        return [];
    }
}

async function fetchMessagesForConversation(conversationId) {
    try {
        const data = await ghlGet(`/conversations/${conversationId}/messages`, {
            limit: 100,
        }, HEADERS_CONV);
        // GHL response: { messages: { messages: [...], lastMessageId, nextPage } }
        const inner = data.messages?.messages || data.messages || [];
        return Array.isArray(inner) ? inner : [];
    } catch (err) {
        return [];
    }
}

async function fetchAllMessages(contacts) {
    console.log('\nFetching conversaciones del agente IA...');
    const conversations = [];
    const messages = [];

    const BATCH = 4;
    for (let i = 0; i < contacts.length; i += BATCH) {
        const slice = contacts.slice(i, i + BATCH);
        await Promise.all(slice.map(async (contact) => {
            const convs = await fetchConversationsForContact(contact.id);
            for (const conv of convs) {
                conversations.push({
                    contactId: contact.id,
                    contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
                    contactPhone: contact.phone || '',
                    contactEmail: contact.email || '',
                    conversationId: conv.id,
                    type: conv.type || '',
                    lastMessageType: conv.lastMessageType || '',
                    lastMessageBody: (conv.lastMessageBody || '').slice(0, 500),
                    lastMessageDate: conv.lastMessageDate || '',
                    unreadCount: conv.unreadCount || 0,
                });

                const msgs = await fetchMessagesForConversation(conv.id);
                for (const m of msgs) {
                    messages.push({
                        contactId: contact.id,
                        contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
                        conversationId: conv.id,
                        messageId: m.id || '',
                        direction: m.direction || '',  // inbound | outbound
                        type: m.type || m.messageType || '',
                        source: m.source || '',  // workflow, app, api, etc
                        body: (m.body || m.message || '').replace(/\s+/g, ' ').slice(0, 1000),
                        status: m.status || '',
                        dateAdded: m.dateAdded || '',
                    });
                }
            }
        }));
        process.stdout.write(`\r  Procesados ${Math.min(i + BATCH, contacts.length)}/${contacts.length} contactos | conv:${conversations.length} msg:${messages.length}`);
    }

    console.log(`\n  Total conversaciones: ${conversations.length}`);
    console.log(`  Total mensajes: ${messages.length}`);
    return { conversations, messages };
}

// ─── CSV builder ──────────────────────────────────────────────────────────────

function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    }
    return str;
}

function toCSV(rows, headers) {
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map(h => escapeCSV(row[h])).join(','));
    }
    return lines.join('\n');
}

// ─── UTM extraction ───────────────────────────────────────────────────────────

function extractUTMs(contact) {
    const attr = contact.attributionSource || {};
    const lastAttr = contact.lastAttributionSource || {};

    let utmCampaignFromUrl = '';
    try {
        const url = new URL(attr.url || '');
        utmCampaignFromUrl = url.searchParams.get('utm_campaign') || '';
    } catch { /* not a valid URL */ }

    return {
        utm_source:    attr.utmSource    || lastAttr.utmSource    || '',
        utm_medium:    attr.utmMedium    || lastAttr.utmMedium    || '',
        utm_campaign:  attr.campaign     || attr.utmCampaign      || utmCampaignFromUrl || lastAttr.campaign || '',
        utm_content:   attr.utmContent   || lastAttr.utmContent   || attr.adName || '',
        utm_term:      attr.utmTerm      || lastAttr.utmTerm      || '',
        ad_id:         attr.adId         || lastAttr.adId         || '',
        adset_id:      attr.adGroupId    || lastAttr.adGroupId    || '',
        campaign_id:   attr.campaignId   || lastAttr.campaignId   || '',
        fbclid:        attr.fbclid       || '',
        gclid:         attr.gclid        || '',
        session_source: attr.sessionSource || '',
        referrer:      attr.referrer     || '',
        landing_url:   attr.url          || '',
        medium_id:     attr.mediumId     || lastAttr.mediumId     || '',
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('═'.repeat(64));
    console.log('  GHL CRM Exporter — Agrícola Cachapoal');
    if (filterDays) console.log(`  Filtro: últimos ${filterDays} días`);
    if (isDryRun) console.log('  MODO: DRY RUN');
    if (skipMessages) console.log('  Modo rápido: omitiendo conversaciones');
    console.log('═'.repeat(64));

    if (!locationId) {
        console.log('\nLocation ID no configurado — auto-descubriendo...');
        try {
            const locData = await ghlGet('/locations/search', { limit: 1 });
            const locs = locData.locations || [];
            if (locs.length > 0) {
                locationId = locs[0].id;
                console.log(`Location ID descubierto: ${locationId} (${locs[0].name || ''})`);
            }
        } catch { /* fallthrough */ }
    }

    if (!locationId) {
        console.error('\nError: No se pudo determinar el Location ID.');
        process.exit(1);
    }

    console.log(`Location: ${locationId}`);

    // Verify credentials
    try {
        await ghlGet('/contacts/', { locationId, limit: 1 });
        console.log('✓ Credenciales y Location ID verificados');
    } catch (err) {
        console.error(`\n✗ Error de autenticación: ${err.message}`);
        process.exit(1);
    }

    if (isDryRun) {
        console.log('\n✓ Dry run completo. Credenciales OK.');
        process.exit(0);
    }

    const cutoff = filterDays ? new Date(Date.now() - filterDays * 86400000) : null;
    if (cutoff) console.log(`Cutoff: contactos/opps creados desde ${cutoff.toISOString().slice(0, 10)}`);

    // Fetch
    const [contacts, opportunities, pipelines] = await Promise.all([
        fetchAllContacts(cutoff),
        fetchAllOpportunities(cutoff),
        fetchPipelines(),
    ]);

    // Enrich: si hay opps cuyos contactId NO están en contacts (reactivaciones de leads viejos),
    // fetcheamos esos contactos individualmente para tener tags/utm/etc.
    const contactIdSet = new Set(contacts.map(c => c.id));
    const missingContactIds = [...new Set(
        opportunities.map(o => o.contactId).filter(id => id && !contactIdSet.has(id))
    )];
    if (missingContactIds.length > 0) {
        console.log(`\nFetching ${missingContactIds.length} contactos reactivados (no incluidos en ventana de ${filterDays || '∞'} días)...`);
        const BATCH = 5;
        for (let i = 0; i < missingContactIds.length; i += BATCH) {
            const slice = missingContactIds.slice(i, i + BATCH);
            const fetched = await Promise.all(
                slice.map(id => ghlGet(`/contacts/${id}`).then(d => d.contact).catch(() => null))
            );
            for (const c of fetched) if (c) contacts.push(c);
            process.stdout.write(`\r  Reactivados enriquecidos: ${Math.min(i + BATCH, missingContactIds.length)}/${missingContactIds.length}`);
        }
        console.log(`\n  Total contactos (con reactivados): ${contacts.length}`);
    }

    // Build pipeline maps
    const stageMap = {};
    const pipelineMap = {};
    for (const pipeline of pipelines) {
        pipelineMap[pipeline.id] = pipeline.name;
        for (const stage of (pipeline.stages || [])) {
            stageMap[stage.id] = stage.name;
        }
    }

    // ─── contacts.csv ─────────────────────────────────────────────────────────

    const contactHeaders = [
        'id', 'firstName', 'lastName', 'email', 'phone',
        'source', 'tags', 'assignedTo',
        'createdAt', 'updatedAt', 'dateAdded',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'ad_id', 'adset_id', 'campaign_id', 'fbclid', 'gclid',
        'session_source', 'referrer', 'landing_url', 'medium_id',
    ];

    const contactRows = contacts.map(c => {
        const utms = extractUTMs(c);
        return {
            id: c.id,
            firstName: c.firstName || '',
            lastName: c.lastName || '',
            email: c.email || '',
            phone: c.phone || '',
            source: c.source || '',
            tags: (c.tags || []).join('; '),
            assignedTo: c.assignedTo || '',
            createdAt: c.createdAt || c.dateAdded || '',
            updatedAt: c.dateUpdated || c.updatedAt || '',
            dateAdded: c.dateAdded || '',
            ...utms,
        };
    });

    // ─── opportunities.csv ────────────────────────────────────────────────────

    const oppHeaders = [
        'id', 'name', 'status', 'monetaryValue',
        'pipeline', 'stage',
        'contactId', 'contactName', 'contactEmail', 'contactPhone',
        'assignedTo', 'source',
        'createdAt', 'updatedAt', 'closedDate',
    ];

    const oppRows = opportunities.map(o => {
        const contact = o.contact || {};
        return {
            id: o.id,
            name: o.name || '',
            status: o.status || '',
            monetaryValue: o.monetaryValue || '',
            pipeline: pipelineMap[o.pipelineId] || o.pipelineId || '',
            stage: stageMap[o.pipelineStageId] || o.pipelineStageId || '',
            contactId: o.contactId || contact.id || '',
            contactName: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            contactEmail: contact.email || '',
            contactPhone: contact.phone || '',
            assignedTo: o.assignedTo || '',
            source: o.source || '',
            createdAt: o.createdAt || '',
            updatedAt: o.dateAdded || o.updatedAt || '',
            closedDate: o.closedDate || '',
        };
    });

    // ─── opportunities-with-utm.csv ───────────────────────────────────────────

    const contactById = Object.fromEntries(contacts.map(c => [c.id, c]));

    const joinHeaders = [
        'opp_id', 'opp_name', 'status', 'monetaryValue',
        'pipeline', 'stage',
        'contactId', 'contactName', 'contactEmail', 'contactPhone',
        'opp_createdAt', 'closedDate',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'ad_id', 'adset_id', 'campaign_id', 'fbclid', 'gclid',
        'session_source', 'referrer', 'landing_url',
    ];

    const joinRows = oppRows.map(opp => {
        const contact = contactById[opp.contactId];
        const utms = contact ? extractUTMs(contact) : {
            utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '',
            ad_id: '', adset_id: '', campaign_id: '', fbclid: '', gclid: '',
            session_source: '', referrer: '', landing_url: '',
        };
        return {
            opp_id: opp.id,
            opp_name: opp.name,
            status: opp.status,
            monetaryValue: opp.monetaryValue,
            pipeline: opp.pipeline,
            stage: opp.stage,
            contactId: opp.contactId,
            contactName: opp.contactName,
            contactEmail: opp.contactEmail,
            contactPhone: opp.contactPhone,
            opp_createdAt: opp.createdAt,
            closedDate: opp.closedDate,
            ...utms,
        };
    });

    // ─── conversations + messages ─────────────────────────────────────────────

    let conversations = [];
    let messages = [];
    if (!skipMessages && contactRows.length > 0) {
        const result = await fetchAllMessages(contacts);
        conversations = result.conversations;
        messages = result.messages;
    }

    // ─── Write files ──────────────────────────────────────────────────────────

    const outDir = resolve(projectRoot, 'context/crm');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const files = [
        { path: resolve(outDir, 'contacts.csv'),               rows: contactRows, headers: contactHeaders },
        { path: resolve(outDir, 'opportunities.csv'),          rows: oppRows,     headers: oppHeaders },
        { path: resolve(outDir, 'opportunities-with-utm.csv'), rows: joinRows,    headers: joinHeaders },
    ];

    if (!skipMessages) {
        files.push(
            { path: resolve(outDir, 'conversations.csv'), rows: conversations, headers: [
                'contactId', 'contactName', 'contactPhone', 'contactEmail',
                'conversationId', 'type', 'lastMessageType', 'lastMessageBody',
                'lastMessageDate', 'unreadCount',
            ]},
            { path: resolve(outDir, 'messages.csv'), rows: messages, headers: [
                'contactId', 'contactName', 'conversationId', 'messageId',
                'direction', 'type', 'source', 'body', 'status', 'dateAdded',
            ]},
        );
    }

    console.log('\nEscribiendo CSVs...');
    for (const { path: filePath, rows, headers } of files) {
        writeFileSync(filePath, toCSV(rows, headers), 'utf8');
        const rel = filePath.replace(projectRoot.replace(/\\/g, '/') + '/', '').replace(/\\/g, '/');
        console.log(`  ✓ ${rel} (${rows.length} rows)`);
    }

    // ─── Summary ──────────────────────────────────────────────────────────────

    const byStage = {};
    for (const opp of joinRows) {
        const stage = opp.stage || '(sin etapa)';
        byStage[stage] = (byStage[stage] || 0) + 1;
    }

    const bySource = {};
    for (const c of contactRows) {
        const src = c.utm_source || c.session_source || c.source || '(sin UTM)';
        bySource[src] = (bySource[src] || 0) + 1;
    }

    const byCampaign = {};
    for (const c of contactRows) {
        const camp = c.utm_campaign || '(sin campaña)';
        byCampaign[camp] = (byCampaign[camp] || 0) + 1;
    }

    console.log('\n' + '═'.repeat(64));
    console.log('  RESUMEN');
    console.log('═'.repeat(64));
    console.log(`\nTotal contactos:     ${contactRows.length}`);
    console.log(`Total oportunidades: ${joinRows.length}`);
    if (!skipMessages) {
        console.log(`Total conversaciones: ${conversations.length}`);
        console.log(`Total mensajes:       ${messages.length}`);
    }

    console.log('\nContactos por UTM source:');
    for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${src.padEnd(40)} ${count}`);
    }

    if (joinRows.length > 0) {
        console.log('\nOportunidades por etapa:');
        for (const [stage, count] of Object.entries(byStage).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${stage.padEnd(40)} ${count}`);
        }
    }

    console.log('\nContactos por campaña (top 10):');
    for (const [camp, count] of Object.entries(byCampaign).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`  ${camp.slice(0, 40).padEnd(40)} ${count}`);
    }

    console.log('\n' + '═'.repeat(64));
    console.log('  Archivos en context/crm/');
    console.log('═'.repeat(64));
}

main().catch(err => {
    console.error(`\n✗ Error inesperado: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
