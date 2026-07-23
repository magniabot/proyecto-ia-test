#!/usr/bin/env node
/**
 * Validación: ¿Cuántas conversaciones existen en TODA la cuenta GHL
 * vs cuántas estamos capturando por contactId?
 *
 * Usa el endpoint /conversations/search con locationId (no contactId)
 * que devuelve TODAS las conversaciones del location.
 */

import { readFileSync, existsSync } from 'fs';
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

const HEADERS_CONV = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-04-15',
};

async function ghlGet(path, params = {}, headers = HEADERS_CONV) {
    const url = new URL(`https://services.leadconnectorhq.com${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
}

async function main() {
    console.log(`Location: ${locationId}\n`);

    // Cargar contactIds de las últimas 30 días
    const contactsCSV = readFileSync(resolve(projectRoot, 'context/crm/contacts.csv'), 'utf8');
    const lines = contactsCSV.split('\n').slice(1).filter(l => l.trim());
    const contactIds30d = new Set(lines.map(l => l.split(',')[0]));
    console.log(`Contactos últimos 30d en CSV: ${contactIds30d.size}\n`);

    // ─── A) Listar TODAS las conversaciones del location (sin filtro de contacto) ───
    console.log('A) Listando TODAS las conversaciones del location (paginado)...');
    const allConvs = [];
    let startAfterDate = null;
    let page = 1;
    while (true) {
        const params = { locationId, limit: 100 };
        if (startAfterDate) params.startAfterDate = startAfterDate;
        try {
            const data = await ghlGet('/conversations/search', params);
            const batch = data.conversations || [];
            allConvs.push(...batch);
            process.stdout.write(`\r  Conversaciones: ${allConvs.length} (página ${page})`);
            if (batch.length < 100) break;
            const last = batch[batch.length - 1];
            startAfterDate = last.lastMessageDate || last.dateAdded;
            if (!startAfterDate) break;
            page++;
            if (page > 100) break;
        } catch (e) {
            console.log(`\n  Error en página ${page}: ${e.message}`);
            break;
        }
    }
    console.log(`\n  Total conversaciones en location: ${allConvs.length}\n`);

    // ─── B) Cruzar con contactos de últimos 30d ───
    const convsFor30d = allConvs.filter(c => contactIds30d.has(c.contactId));
    const uniqueContactsWithConv = new Set(convsFor30d.map(c => c.contactId));
    console.log(`B) Conversaciones que pertenecen a contactos de últimos 30d:`);
    console.log(`   Conversaciones: ${convsFor30d.length}`);
    console.log(`   Contactos únicos con conversación: ${uniqueContactsWithConv.size} / ${contactIds30d.size}`);
    console.log(`   Contactos SIN conversación: ${contactIds30d.size - uniqueContactsWithConv.size}\n`);

    // ─── C) Tipos de conversaciones ───
    const typeCount = {};
    for (const c of convsFor30d) {
        const t = c.type || c.lastMessageType || '(unknown)';
        typeCount[t] = (typeCount[t] || 0) + 1;
    }
    console.log(`C) Tipos de conversación (de los últimos 30d):`);
    for (const [t, n] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${t.padEnd(30)} ${n}`);
    }

    // ─── D) Filtrar por fecha — conversaciones creadas en últimos 30 días (independiente de contactos) ───
    const cutoff = new Date(Date.now() - 30 * 86400000);
    const convsLast30d = allConvs.filter(c => {
        const d = new Date(c.lastMessageDate || c.dateAdded);
        return d >= cutoff;
    });
    console.log(`\nD) Conversaciones con actividad en últimos 30 días (cualquier contacto):`);
    console.log(`   ${convsLast30d.length}`);

    // ─── E) Sample contactos sin conversación ───
    const idsConConv = new Set(convsFor30d.map(c => c.contactId));
    const idsSinConv = [...contactIds30d].filter(id => !idsConConv.has(id));
    console.log(`\nE) Sample 5 contactIds sin conversación:`);
    for (const id of idsSinConv.slice(0, 5)) {
        console.log(`   ${id}`);
    }

    // ─── F) Para cada contacto sin conversación, intentar buscar conversaciones directamente ───
    if (idsSinConv.length > 0) {
        console.log(`\nF) Re-buscando conversaciones directamente para los primeros 10 sin-conversación:`);
        let foundExtra = 0;
        for (const id of idsSinConv.slice(0, 10)) {
            try {
                const d = await ghlGet('/conversations/search', { locationId, contactId: id, limit: 10 });
                const found = (d.conversations || []).length;
                if (found > 0) {
                    foundExtra++;
                    console.log(`   ${id}: ${found} conversaciones encontradas (¡no estaban en el listado general!)`);
                }
            } catch (e) {
                console.log(`   ${id}: error ${e.message.slice(0, 60)}`);
            }
        }
        console.log(`   → ${foundExtra}/10 contactos tenían conversaciones que se nos escaparon`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
