#!/usr/bin/env python3
"""Deep dive: por qué 71% sin conversación, qué pasa con adwords, flujo del agente."""
import csv
import os
from collections import defaultdict, Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
CRM_DIR = os.path.join(ROOT, 'context', 'crm')

def load_csv(name):
    with open(os.path.join(CRM_DIR, name), encoding='utf-8') as f:
        return list(csv.DictReader(f))

contacts = load_csv('contacts.csv')
opps = load_csv('opportunities.csv')
opps_utm = load_csv('opportunities-with-utm.csv')
convs = load_csv('conversations.csv')
msgs = load_csv('messages.csv')

contact_ids_with_conv = set(c['contactId'] for c in convs)
contact_by_id = {c['id']: c for c in contacts}

print('\n' + '=' * 70)
print('  DEEP DIVE — Agrícola GHL')
print('=' * 70)

# ─── A. ¿Por qué 71% sin conversación? ──────────────────────────────
print('\n\nA. CONTACTOS SIN CONVERSACIÓN — perfil')
print('-' * 70)
sin_conv = [c for c in contacts if c['id'] not in contact_ids_with_conv]
con_conv = [c for c in contacts if c['id'] in contact_ids_with_conv]

sin_phone = [c for c in sin_conv if not c['phone'].strip()]
sin_email = [c for c in sin_conv if not c['email'].strip()]
sin_ambos = [c for c in sin_conv if not c['phone'].strip() and not c['email'].strip()]
sin_phone_con_email = [c for c in sin_conv if not c['phone'].strip() and c['email'].strip()]
sin_nombre = [c for c in sin_conv if not c['firstName'].strip()]

print(f'  Total sin conversación: {len(sin_conv)}')
print(f'  Sin teléfono:           {len(sin_phone)} ({100*len(sin_phone)/len(sin_conv):.0f}%)')
print(f'  Sin email:              {len(sin_email)} ({100*len(sin_email)/len(sin_conv):.0f}%)')
print(f'  Sin ambos (phone+mail): {len(sin_ambos)}')
print(f'  Sin tel pero con mail:  {len(sin_phone_con_email)}')
print(f'  Sin nombre (firstName): {len(sin_nombre)}')

# Comparativa con los que SÍ tuvieron conversación
sin_phone_con = [c for c in con_conv if not c['phone'].strip()]
print(f'\n  COMPARATIVA: contactos CON conversación = {len(con_conv)}')
print(f'  De ellos sin teléfono:  {len(sin_phone_con)} ({100*len(sin_phone_con)/len(con_conv):.0f}%)')

print('\n  → Hipótesis: el agente solo trabaja contactos con teléfono válido')

# ─── B. Sin conversación por fuente UTM ─────────────────────────────
print('\n\nB. CONTACTOS SIN CONVERSACIÓN — por fuente UTM')
print('-' * 70)
sin_by_src = Counter()
total_by_src = Counter()
for c in contacts:
    src = c['utm_source'] or c['session_source'] or c['source'] or '(sin atrib)'
    total_by_src[src] += 1
    if c['id'] not in contact_ids_with_conv:
        sin_by_src[src] += 1

print(f'  {"Fuente":25} {"Total":>6} {"Sin conv":>10} {"%":>6}')
for src, total in total_by_src.most_common():
    sin = sin_by_src[src]
    pct = 100*sin/total if total else 0
    print(f'  {src:25} {total:>6} {sin:>10} {pct:>5.0f}%')

# ─── C. Los 20 leads de adwords ────────────────────────────────────
print('\n\nC. LOS 20 LEADS DE GOOGLE ADS (adwords) — desglose detallado')
print('-' * 70)
adwords_contacts = [c for c in contacts if (c['utm_source'] or '').lower() == 'adwords']
adwords_camps = Counter(c['utm_campaign'] for c in adwords_contacts)
adwords_content = Counter(c['utm_content'] for c in adwords_contacts)
adwords_terms = Counter(c['utm_term'] for c in adwords_contacts)

print(f'  Por campaña:')
for camp, n in adwords_camps.most_common():
    print(f'    {camp[:55]:55} {n}')
print(f'\n  Por utm_content (creative/keyword):')
for c, n in adwords_content.most_common(10):
    print(f'    {c[:55]:55} {n}')
print(f'\n  Por utm_term:')
for t, n in adwords_terms.most_common(10):
    print(f'    {t[:55]:55} {n}')

# ¿Cuántos tienen teléfono?
con_phone_aw = [c for c in adwords_contacts if c['phone'].strip()]
print(f'\n  De los 20 adwords: {len(con_phone_aw)} con teléfono, {20-len(con_phone_aw)} sin')

# ¿Cuántos tienen conversación?
con_conv_aw = [c for c in adwords_contacts if c['id'] in contact_ids_with_conv]
print(f'  De los 20 adwords: {len(con_conv_aw)} con conversación, {20-len(con_conv_aw)} sin')

# Etapa de los 20 adwords
opps_by_contact = defaultdict(list)
for o in opps:
    opps_by_contact[o['contactId']].append(o)

aw_stages = Counter()
for c in adwords_contacts:
    for o in opps_by_contact.get(c['id'], []):
        aw_stages[o['stage'] or '(sin opp)'] += 1
    if c['id'] not in opps_by_contact:
        aw_stages['(sin oportunidad)'] += 1
print(f'\n  Etapas de los 20 adwords:')
for s, n in aw_stages.most_common():
    print(f'    {s:30} {n}')

# ─── D. Flujo del agente IA — orden de mensajes ────────────────────
print('\n\nD. FLUJO DEL AGENTE IA — qué pasa después del primer mensaje')
print('-' * 70)

msgs_by_contact = defaultdict(list)
for m in msgs:
    msgs_by_contact[m['contactId']].append(m)
for cid in msgs_by_contact:
    msgs_by_contact[cid].sort(key=lambda m: m['dateAdded'])

# Para cada contacto con conversación, calcular:
# - quién inició
# - cuántos turnos tuvo el lead (inbound)
# - hasta dónde llegó el agente

# Categorizar conversaciones
agente_solo = 0       # solo outbound, lead nunca respondió
una_respuesta = 0     # lead respondió 1 vez y se quedó
conv_corta = 0        # 2-4 turnos del lead
conv_larga = 0        # 5+ turnos del lead

for cid in contact_ids_with_conv:
    in_count = sum(1 for m in msgs_by_contact[cid] if m['direction'].lower() == 'inbound')
    if in_count == 0: agente_solo += 1
    elif in_count == 1: una_respuesta += 1
    elif in_count <= 4: conv_corta += 1
    else: conv_larga += 1

print(f'  Lead NO respondió (solo agente):     {agente_solo}')
print(f'  Lead respondió 1 vez (se cayó):      {una_respuesta}')
print(f'  Conversación corta (2-4 turnos):     {conv_corta}')
print(f'  Conversación larga (5+ turnos):      {conv_larga}')

# ─── E. Mostrar conversación completa de los 2 agendados ───────────
print('\n\nE. CONVERSACIÓN COMPLETA DE LOS 2 AGENDADOS')
print('-' * 70)
agendados_cids = [o['contactId'] for o in opps if o['stage'] == 'Agendado']
for aid in agendados_cids:
    contact = contact_by_id.get(aid, {})
    name = f"{contact.get('firstName','')} {contact.get('lastName','')}".strip() or aid
    src = contact.get('utm_source') or contact.get('source') or '—'
    camp = contact.get('utm_campaign') or '—'
    print(f'\n  ►► {name} ({src} | {camp[:40]})')
    msgs_for = msgs_by_contact.get(aid, [])
    if not msgs_for:
        print('    (sin mensajes registrados)')
        continue
    for m in msgs_for[:30]:
        arrow = '←' if m['direction'].lower() == 'inbound' else '→'
        body = m['body'].replace('\n', ' ')[:180]
        date = m['dateAdded'][:16] if m['dateAdded'] else '?'
        print(f'    [{date}] {arrow} {body}')

# ─── F. Conversaciones que NO terminaron en agendamiento ───────────
print('\n\nF. CONVERSACIONES LARGAS (5+ turnos del lead) que NO agendaron')
print('-' * 70)
agendados_set = set(agendados_cids)
for cid in contact_ids_with_conv:
    in_count = sum(1 for m in msgs_by_contact[cid] if m['direction'].lower() == 'inbound')
    if in_count < 5 or cid in agendados_set: continue
    contact = contact_by_id.get(cid, {})
    name = f"{contact.get('firstName','')} {contact.get('lastName','')}".strip() or cid
    src = contact.get('utm_source') or contact.get('source') or '—'
    camp = contact.get('utm_campaign') or '—'
    n_msgs = len(msgs_by_contact[cid])
    out_count = n_msgs - in_count
    # Etapa actual
    stage = (opps_by_contact.get(cid, [{}])[0] or {}).get('stage', '—')
    print(f'\n  ►► {name} ({src}) | Etapa: {stage} | In: {in_count} Out: {out_count}')
    print(f'     Camp: {camp[:60]}')
    # Últimos 6 mensajes
    for m in msgs_by_contact[cid][-6:]:
        arrow = '←' if m['direction'].lower() == 'inbound' else '→'
        body = m['body'].replace('\n', ' ')[:160]
        print(f'    {arrow} {body}')

# ─── G. Pasos del flujo: ¿en qué se cae? ────────────────────────────
print('\n\nG. ANÁLISIS DEL FLUJO DEL AGENTE — ¿cuándo se cae el lead?')
print('-' * 70)
# Después de cuántos outbound del agente, el lead deja de responder
last_dir_per_contact = Counter()
for cid in contact_ids_with_conv:
    if msgs_by_contact[cid]:
        last_dir_per_contact[msgs_by_contact[cid][-1]['direction'].lower()] += 1
print(f'  Último mensaje fue del agente (outbound): {last_dir_per_contact["outbound"]}  → lead no contestó')
print(f'  Último mensaje fue del lead (inbound):    {last_dir_per_contact["inbound"]}  → agente no contestó')

# Tags de los contactos con conversación
print('\n\n  TAGS de contactos con conversación:')
tag_counter = Counter()
for c in con_conv:
    for t in (c['tags'] or '').split(';'):
        t = t.strip()
        if t: tag_counter[t] += 1
for t, n in tag_counter.most_common(15):
    print(f'    {t:40} {n}')

print('\n' + '=' * 70)
