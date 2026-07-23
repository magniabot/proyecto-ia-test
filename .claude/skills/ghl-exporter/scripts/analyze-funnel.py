#!/usr/bin/env python3
"""Análisis del embudo GHL para Agrícola — últimos 30 días."""
import csv
import os
from collections import defaultdict, Counter
from datetime import datetime

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

print(f'\n{"="*70}')
print(f'  EMBUDO AGRÍCOLA — Últimos 30 días')
print(f'  Generado: {datetime.now().strftime("%Y-%m-%d %H:%M")}')
print(f'{"="*70}\n')

# ─── 1. Resumen general ──────────────────────────────────────────────
print('1. RESUMEN GENERAL')
print('-' * 70)
print(f'  Contactos totales:     {len(contacts)}')
print(f'  Oportunidades creadas: {len(opps)}')
print(f'  Conversaciones:        {len(convs)} ({len(set(c["contactId"] for c in convs))} contactos únicos)')
print(f'  Mensajes totales:      {len(msgs)}')

# Contactos sin conversación
contact_ids_with_conv = set(c['contactId'] for c in convs)
sin_conv = [c for c in contacts if c['id'] not in contact_ids_with_conv]
print(f'  Contactos SIN conversación: {len(sin_conv)} ({100*len(sin_conv)/len(contacts):.0f}%)')

# ─── 2. Funnel por etapa ────────────────────────────────────────────
print('\n2. EMBUDO POR ETAPA DE PIPELINE')
print('-' * 70)
stage_order = ['Nuevo Prospecto', 'Contacto Realizado', 'Agendado', 'Visita Realizada', 'Negociación', 'Vendido', 'Perdido']
stage_count = Counter(o['stage'] or '(sin etapa)' for o in opps)
for s, n in stage_count.most_common():
    pct = 100*n/len(opps) if opps else 0
    bar = '█' * int(pct/2)
    print(f'  {s:35} {n:3}  {pct:5.1f}%  {bar}')

# ─── 3. Por fuente UTM ───────────────────────────────────────────────
print('\n3. CONTACTOS POR FUENTE (UTM source)')
print('-' * 70)
src_count = Counter()
for c in contacts:
    src = c['utm_source'] or c['session_source'] or c['source'] or '(sin atribución)'
    src_count[src] += 1
for s, n in src_count.most_common():
    pct = 100*n/len(contacts)
    print(f'  {s:30} {n:3}  ({pct:.0f}%)')

# ─── 4. Embudo por fuente ────────────────────────────────────────────
print('\n4. EMBUDO POR FUENTE (UTM source × etapa)')
print('-' * 70)
funnel_by_source = defaultdict(lambda: Counter())
for o in opps_utm:
    src = o['utm_source'] or o['session_source'] or '(sin atribución)'
    stage = o['stage'] or '(sin etapa)'
    funnel_by_source[src][stage] += 1

print(f'  {"Fuente":30} {"Total":>6} {"Nuevo":>7} {"Contac":>7} {"Agend":>6} {"%Agend":>7}')
for src, stages in sorted(funnel_by_source.items(), key=lambda x: -sum(x[1].values())):
    total = sum(stages.values())
    nuevo = stages.get('Nuevo Prospecto', 0)
    contact = stages.get('Contacto Realizado', 0)
    agend = stages.get('Agendado', 0)
    pct_agend = 100*agend/total if total else 0
    print(f'  {src:30} {total:>6} {nuevo:>7} {contact:>7} {agend:>6} {pct_agend:>6.1f}%')

# ─── 5. Por campaña ──────────────────────────────────────────────────
print('\n5. EMBUDO POR CAMPAÑA UTM')
print('-' * 70)
funnel_by_camp = defaultdict(lambda: Counter())
for o in opps_utm:
    camp = (o['utm_campaign'] or '(sin campaña)')[:50]
    stage = o['stage'] or '(sin etapa)'
    funnel_by_camp[camp][stage] += 1

print(f'  {"Campaña":50} {"Total":>5} {"Agend":>6} {"%":>5}')
for camp, stages in sorted(funnel_by_camp.items(), key=lambda x: -sum(x[1].values())):
    total = sum(stages.values())
    agend = stages.get('Agendado', 0)
    pct = 100*agend/total if total else 0
    print(f'  {camp:50} {total:>5} {agend:>6} {pct:>4.0f}%')

# ─── 6. Análisis de conversaciones ──────────────────────────────────
print('\n6. ANÁLISIS DE CONVERSACIONES DEL AGENTE IA')
print('-' * 70)

inbound = [m for m in msgs if m['direction'].lower() == 'inbound']
outbound = [m for m in msgs if m['direction'].lower() == 'outbound']
print(f'  Mensajes inbound (lead → agente):   {len(inbound)}')
print(f'  Mensajes outbound (agente → lead):  {len(outbound)}')

# Mensajes por contacto
msgs_per_contact = Counter(m['contactId'] for m in msgs)
inbound_per_contact = Counter(m['contactId'] for m in inbound)
outbound_per_contact = Counter(m['contactId'] for m in outbound)

contacts_responded = [cid for cid, n in inbound_per_contact.items() if n > 0]
print(f'\n  Contactos que respondieron al menos 1 vez: {len(contacts_responded)} / {len(contact_ids_with_conv)}')

# Mensajes por tipo / canal
type_count = Counter(m['type'] for m in msgs if m['type'])
print(f'\n  Distribución por canal/tipo de mensaje:')
for t, n in type_count.most_common():
    print(f'    {t:30} {n}')

# Contactos sin respuesta del agente (outbound = 0)
sin_outbound = [cid for cid in contact_ids_with_conv if outbound_per_contact[cid] == 0]
print(f'\n  Conversaciones SIN respuesta del agente: {len(sin_outbound)}')

# Distribución de mensajes por contacto
buckets = Counter()
for cid in contact_ids_with_conv:
    n = msgs_per_contact[cid]
    if n == 0: buckets['0'] += 1
    elif n <= 2: buckets['1-2'] += 1
    elif n <= 5: buckets['3-5'] += 1
    elif n <= 10: buckets['6-10'] += 1
    else: buckets['11+'] += 1
print(f'\n  Distribución de # mensajes por contacto (con conversación):')
for b in ['0', '1-2', '3-5', '6-10', '11+']:
    print(f'    {b:10} {buckets[b]} contactos')

# ─── 7. Cruce: conversación × etapa ─────────────────────────────────
print('\n7. CRUCE: ¿LOS QUE AGENDARON TUVIERON CONVERSACIÓN?')
print('-' * 70)
opp_by_contact = {o['contactId']: o for o in opps}
agendados = [o for o in opps if o['stage'] == 'Agendado']
contactados = [o for o in opps if o['stage'] == 'Contacto Realizado']
nuevos = [o for o in opps if o['stage'] == 'Nuevo Prospecto']

def stats(label, opps_list):
    if not opps_list: return
    cids = [o['contactId'] for o in opps_list]
    with_conv = [c for c in cids if c in contact_ids_with_conv]
    total_msg = sum(msgs_per_contact[c] for c in cids)
    total_in = sum(inbound_per_contact[c] for c in cids)
    avg_msg = total_msg/len(cids) if cids else 0
    print(f'  {label:25} N={len(opps_list):3} | Con conversación: {len(with_conv)} | Avg msgs: {avg_msg:.1f} | Inbound: {total_in}')

stats('Nuevo Prospecto', nuevos)
stats('Contacto Realizado', contactados)
stats('Agendado', agendados)

# ─── 8. Atribución de los 2 agendados ───────────────────────────────
print('\n8. ATRIBUCIÓN DE LOS AGENDADOS (cuáles anuncios funcionaron)')
print('-' * 70)
for o in opps_utm:
    if o['stage'] == 'Agendado':
        print(f'  • {o["contactName"] or o["contactEmail"] or o["contactId"]}')
        print(f'    Source: {o["utm_source"] or "—"} | Medium: {o["utm_medium"] or "—"}')
        print(f'    Campaign: {o["utm_campaign"] or "—"}')
        print(f'    Content: {o["utm_content"] or "—"}')
        print()

# ─── 9. Sample de mensajes outbound del agente IA ───────────────────
print('\n9. MUESTRA DE MENSAJES DEL AGENTE IA (outbound, primeros 5)')
print('-' * 70)
for m in outbound[:5]:
    body = m['body'].replace('\n', ' ')[:200]
    print(f'  [{m["type"]}] → {m["contactName"] or m["contactId"]}')
    print(f'    {body}')
    print()

# ─── 10. Sample de mensajes inbound (qué dicen los leads) ───────────
print('\n10. MUESTRA DE MENSAJES INBOUND (qué dicen los leads, primeros 5)')
print('-' * 70)
for m in inbound[:5]:
    body = m['body'].replace('\n', ' ')[:200]
    print(f'  [{m["type"]}] ← {m["contactName"] or m["contactId"]}')
    print(f'    {body}')
    print()

print(f'\n{"="*70}')
print(f'  Análisis completo. Data raw en context/crm/')
print(f'{"="*70}\n')
