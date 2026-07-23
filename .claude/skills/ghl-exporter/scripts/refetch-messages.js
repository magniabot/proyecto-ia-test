#!/usr/bin/env node
/**
 * Re-fetch correcto de conversaciones + mensajes:
 * 1. Listar TODAS las conversaciones del location (paginado por fecha)
 * 2. Filtrar a contactos de los últimos 30 días (de contacts.csv)
 * 3. Para cada conversación, fetch mensajes
 * 4. Reescribir conversations.csv y messages.csv
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
let projectRoot = __dirname;
while (!existsSync(resolve(projectRoot, 'config')) && resolve(projectRoot, '..') !== projectRoot) {
    projectRoot = resolve(projectRoot, '..');
}
config({ path: resolve(projectRoot, 'config/.env') });

const apiKey = process.env.GHL_API_KEY;
const locationId = process.env.GHL_LOCATION_ID;

const HEADERS = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-04-15',
};

async function ghlGet(path, params = {}) {
    const url = new URL(`https://services.leadconnectorhq.com${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}

function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    }
    return str;
}
function toCSV(rows, headers) {
    return [headers.join(','), ...rows.map(r => headers.map(h => escapeCSV(r[h])).join(','))].join('\n');
}

async function main() {
    // Leer contactos de últimos 30d
    const contactsCSV = readFileSync(resolve(projectRoot, 'context/crm/contacts.csv'), 'utf8');
    const lines = contactsCSV.split('\n').filter(l => l.trim());
    const headerRow = lines[0].split(',');
    const idxId = headerRow.indexOf('id');
    const idxFirst = headerRow.indexOf('firstName');
    const idxLast = headerRow.indexOf('lastName');
    const idxPhone = headerRow.indexOf('phone');
    const idxEmail = headerRow.indexOf('email');

    const contactInfo = {};
    for (const line of lines.slice(1)) {
        // Parse simple CSV (la primera columna nunca está quoted)
        const parts = line.split(',');
        const id = parts[idxId];
        contactInfo[id] = {
            firstName: parts[idxFirst] || '',
            lastName: parts[idxLast] || '',
            phone: parts[idxPhone] || '',
            email: parts[idxEmail] || '',
        };
    }
    const contactIds = new Set(Object.keys(contactInfo));
    console.log(`Contactos a procesar: ${contactIds.size}`);

    // ─── A) Listar todas las conversaciones del location ─────────────────────
    console.log('\nListando conversaciones del location...');
    const allConvs = [];
    let startAfterDate = null;
    let page = 1;
    while (true) {
        const params = { locationId, limit: 100 };
        if (startAfterDate) params.startAfterDate = startAfterDate;
        const data = await ghlGet('/conversations/search', params);
        const batch = data.conversations || [];
        allConvs.push(...batch);
        process.stdout.write(`\r  ${allConvs.length} conversaciones (página ${page})`);
        if (batch.length < 100) break;
        const last = batch[batch.length - 1];
        startAfterDate = last.lastMessageDate || last.dateAdded;
        if (!startAfterDate) break;
        page++;
        if (page > 100) break;
    }
    console.log(`\n  Total en location: ${allConvs.length}`);

    // ─── B) Filtrar a contactos de últimos 30d ───────────────────────────────
    const convs30d = allConvs.filter(c => contactIds.has(c.contactId));
    console.log(`  Conversaciones de contactos últimos 30d: ${convs30d.length}`);
    console.log(`  Contactos únicos con conversación: ${new Set(convs30d.map(c => c.contactId)).size}\n`);

    // ─── C) Para cada conversación, fetch mensajes ───────────────────────────
    console.log('Fetcheando mensajes de cada conversación...');
    const allMessages = [];
    const convRows = [];

    for (let i = 0; i < convs30d.length; i++) {
        const conv = convs30d[i];
        const ci = contactInfo[conv.contactId] || {};
        const name = `${ci.firstName} ${ci.lastName}`.trim();

        convRows.push({
            contactId: conv.contactId,
            contactName: name,
            contactPhone: ci.phone,
            contactEmail: ci.email,
            conversationId: conv.id,
            type: conv.type || '',
            lastMessageType: conv.lastMessageType || '',
            lastMessageBody: (conv.lastMessageBody || '').slice(0, 500),
            lastMessageDate: conv.lastMessageDate || '',
            unreadCount: conv.unreadCount || 0,
        });

        try {
            const data = await ghlGet(`/conversations/${conv.id}/messages`, { limit: 100 });
            const inner = data.messages?.messages || data.messages || [];
            const msgs = Array.isArray(inner) ? inner : [];
            for (const m of msgs) {
                allMessages.push({
                    contactId: conv.contactId,
                    contactName: name,
                    conversationId: conv.id,
                    messageId: m.id || '',
                    direction: m.direction || '',
                    type: m.type || m.messageType || '',
                    source: m.source || '',
                    body: (m.body || m.message || '').replace(/\s+/g, ' ').slice(0, 1000),
                    status: m.status || '',
                    dateAdded: m.dateAdded || '',
                });
            }
        } catch (e) {
            console.log(`\n  Error en conv ${conv.id}: ${e.message.slice(0, 80)}`);
        }

        process.stdout.write(`\r  ${i + 1}/${convs30d.length} | mensajes: ${allMessages.length}`);
    }
    console.log(`\n\nTotal: ${convRows.length} conversaciones, ${allMessages.length} mensajes`);

    // ─── D) Escribir CSVs ────────────────────────────────────────────────────
    const outDir = resolve(projectRoot, 'context/crm');
    writeFileSync(resolve(outDir, 'conversations.csv'), toCSV(convRows, [
        'contactId', 'contactName', 'contactPhone', 'contactEmail',
        'conversationId', 'type', 'lastMessageType', 'lastMessageBody',
        'lastMessageDate', 'unreadCount',
    ]));
    writeFileSync(resolve(outDir, 'messages.csv'), toCSV(allMessages, [
        'contactId', 'contactName', 'conversationId', 'messageId',
        'direction', 'type', 'source', 'body', 'status', 'dateAdded',
    ]));
    console.log('\n✓ conversations.csv y messages.csv reescritos');
}

main().catch(e => { console.error(`\n✗ ${e.message}\n${e.stack}`); process.exit(1); });
