#!/usr/bin/env python3
"""Dashboard global builder — config-driven, multi-cliente.

Reads config/dashboard.config.json (project label, channels, pipeline stages,
alerts, conversations mode) and produces created/dashboards/global-{date}.html
with Magnia branding (white + blue palette).

Usage:
  python .claude/skills/dashboard-global/scripts/build.py
  python .claude/skills/dashboard-global/scripts/build.py --reconfig

If --reconfig is passed (or no config exists), the agent should run the
interview before invoking this script. This script does NOT prompt — it just
errors out clearly if config is missing.
"""
import csv
import json
import os
import re
import sys
from collections import defaultdict, Counter
from datetime import datetime, timedelta

# CLI args: --reconfig, --date=YYYY-MM-DD (override output filename + period anchor)
OVERRIDE_DATE = None
for a in sys.argv[1:]:
    if a.startswith('--date='):
        OVERRIDE_DATE = a.split('=', 1)[1].strip()

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SKILL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CONFIG_PATH = os.path.join(ROOT, 'config', 'dashboard.config.json')
TEMPLATE_PATH = os.path.join(SKILL_DIR, 'reference', 'config-template.json')
CRM_DIR = os.path.join(ROOT, 'context', 'crm')
META_CSV = os.path.join(ROOT, 'context', 'meta-ads', 'data', 'insights-campaign.csv')
GADS_CSV = os.path.join(ROOT, 'context', 'google-ads', 'data', 'campaigns-last30d.csv')
LOGO_PATH = os.path.abspath(os.path.join(ROOT, '..', 'magnia', 'created', 'assets', 'logo-base64.txt'))
OUT_DIR = os.path.join(ROOT, 'created', 'dashboards')

# ─── Config ────────────────────────────────────────────────────────
if '--reconfig' in sys.argv or not os.path.exists(CONFIG_PATH):
    print(f'ERROR: config not found at {CONFIG_PATH}')
    print(f'Template: {TEMPLATE_PATH}')
    print('Run the dashboard-global skill interview to generate config, then re-run this script.')
    sys.exit(1)

with open(CONFIG_PATH, encoding='utf-8') as f:
    CFG = json.load(f)

PROJECT_LABEL = CFG.get('project_label', 'Proyecto · Cliente')
CH = CFG.get('channels', {})
LOAD_META = CH.get('meta_ads', True)
LOAD_GOOGLE = CH.get('google_ads', True)
CONV_MODE = CFG.get('conversations_mode', 'ia')  # 'ia' | 'manual'
ALERTS = CFG.get('alerts', {})
CPL_WARN = ALERTS.get('cpl_threshold_warn', 50000)
TARGET_CPL = ALERTS.get('target_cpl', 15000)
MIN_AGEND = ALERTS.get('min_agendamientos_warn', 5)
PIPELINE_STAGES = CFG.get('pipeline_stages', [])
if not PIPELINE_STAGES:
    print('ERROR: pipeline_stages is empty in config — at least one stage required.')
    sys.exit(1)

# Copy adaptativo según modo
AGENT_LABEL = 'agente IA' if CONV_MODE == 'ia' else 'ejecutivo'
AGENT_LABEL_SHORT = 'IA' if CONV_MODE == 'ia' else 'ejecutivo'
CONV_VIEW_TITLE = 'Performance de conversaciones'

os.makedirs(OUT_DIR, exist_ok=True)

# ─── Carga datos ───────────────────────────────────────────────────
def load_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as f:
        return list(csv.DictReader(f))

contacts_all = load_csv(os.path.join(CRM_DIR, 'contacts.csv'))
opps_all = load_csv(os.path.join(CRM_DIR, 'opportunities.csv'))
msgs = load_csv(os.path.join(CRM_DIR, 'messages.csv'))
meta_rows = load_csv(META_CSV) if LOAD_META else []
gads_rows = load_csv(GADS_CSV) if LOAD_GOOGLE else []

# ─── Período de reporte ────────────────────────────────────────────
# Anchor: Meta date_start/date_stop si existe; sino últimos 30 días desde hoy/--date.
anchor_date = OVERRIDE_DATE or datetime.now().strftime('%Y-%m-%d')
if meta_rows and meta_rows[0].get('date_start') and meta_rows[0].get('date_stop'):
    period_start = meta_rows[0]['date_start'][:10]
    period_end = meta_rows[0]['date_stop'][:10]
else:
    end_dt = datetime.strptime(anchor_date, '%Y-%m-%d')
    period_start = (end_dt - timedelta(days=30)).strftime('%Y-%m-%d')
    period_end = anchor_date

def in_period(date_str):
    if not date_str:
        return False
    d = date_str[:10]
    return period_start <= d <= period_end

# Contactos del período (leads "nuevos" creados dentro del período)
contacts = [c for c in contacts_all if in_period(c.get('dateAdded', ''))]
contact_ids_in_period = set(c['id'] for c in contacts)

# Opps con actividad en el período (capta reactivaciones de leads viejos)
opps = [o for o in opps_all if in_period(o.get('updatedAt', ''))]

# Logo
try:
    with open(LOGO_PATH, encoding='utf-8') as f:
        logo_data = f.read().strip()
except FileNotFoundError:
    logo_data = ''

# ─── Indexes ───────────────────────────────────────────────────────
contact_by_id = {c['id']: c for c in contacts}
contact_by_id_all = {c['id']: c for c in contacts_all}
opp_by_contact = defaultdict(list)
for o in opps:
    opp_by_contact[o['contactId']].append(o)
msgs_by_contact = defaultdict(list)
for m in msgs:
    msgs_by_contact[m['contactId']].append(m)
for cid in msgs_by_contact:
    msgs_by_contact[cid].sort(key=lambda m: m['dateAdded'])

def src_of(c):
    return c.get('utm_source') or c.get('session_source') or c.get('source') or '(sin atrib)'

def parse_float(v, default=0):
    try: return float(v)
    except: return default

# ─── Spend totals ──────────────────────────────────────────────────
meta_total_spend = sum(parse_float(r['spend']) for r in meta_rows)
meta_total_clicks = sum(int(parse_float(r['clicks'])) for r in meta_rows)
meta_total_impr = sum(int(parse_float(r['impressions'])) for r in meta_rows)
meta_total_leads_pixel = sum(int(parse_float(r.get('actions_lead', 0))) for r in meta_rows)

gads_total_spend = sum(parse_float(r['metrics.cost']) for r in gads_rows)
gads_total_clicks = sum(int(parse_float(r['metrics.clicks'])) for r in gads_rows)
gads_total_impr = sum(int(parse_float(r['metrics.impressions'])) for r in gads_rows)
gads_total_conv = sum(parse_float(r['metrics.conversions']) for r in gads_rows)

total_spend = meta_total_spend + gads_total_spend

# ─── Leads por canal ───────────────────────────────────────────────
def src_normalized(c):
    s = (c.get('utm_source') or '').lower()
    if 'fb' in s or 'facebook' in s or 'meta' in s or 'ig' in s or 'instagram' in s:
        return 'meta'
    if 'adword' in s or 'google' in s:
        return 'google'
    return 'other'

leads_meta = [c for c in contacts if src_normalized(c) == 'meta']
leads_google = [c for c in contacts if src_normalized(c) == 'google']
leads_other = [c for c in contacts if src_normalized(c) == 'other']

# ─── Pipeline stages ───────────────────────────────────────────────
STAGE_NAMES = [s['name'] for s in PIPELINE_STAGES]

def stage_count_for(cs):
    cset = set(c['id'] for c in cs) if cs and isinstance(cs[0], dict) else set(cs)
    counts = {n: 0 for n in STAGE_NAMES}
    for o in opps:
        if o['contactId'] in cset and o['stage'] in counts:
            counts[o['stage']] += 1
    return counts

stages_total = stage_count_for(contacts)
stages_meta = stage_count_for(leads_meta)
stages_google = stage_count_for(leads_google)

# Funnel total incluye TODAS las opps con actividad en el período (incluye reactivados),
# no solo las atribuidas a leads nuevos. Útil para ver el throughput real del pipeline.
stages_total_all = {n: 0 for n in STAGE_NAMES}
for o in opps:
    if o['stage'] in stages_total_all:
        stages_total_all[o['stage']] += 1

# ─── Derivaciones a ejecutivo (tag "asistencia requerida") ─────────
ASSIST_TAG = 'asistencia requerida'

def has_assist_tag(c):
    return ASSIST_TAG in (c.get('tags', '') or '').lower()

derived_contacts = [c for c in contacts if has_assist_tag(c)]
derived_meta = [c for c in leads_meta if has_assist_tag(c)]
derived_google = [c for c in leads_google if has_assist_tag(c)]

# Cuántos de los derivados terminaron agendando (cierre del ejecutivo)
agendado_contact_ids = set(o['contactId'] for o in opps if o['stage'] == 'Agendado')
derived_agendaron = [c for c in derived_contacts if c['id'] in agendado_contact_ids]
derived_no_agendaron = [c for c in derived_contacts if c['id'] not in agendado_contact_ids]

n_derived = len(derived_contacts)
n_derived_agendaron = len(derived_agendaron)

# Estado final del lead (3 buckets mutuamente exclusivos)
# Universe = todos los contactos con opp activa en el período (incluye nuevos del período + reactivados)
period_active_ids = set(o['contactId'] for o in opps)
universe_size = len(period_active_ids)

# Derivados totales: cualquier contacto del universe con tag "asistencia requerida"
derived_universe = [c for c in contacts_all if c['id'] in period_active_ids and has_assist_tag(c)]
derived_universe_ids = set(c['id'] for c in derived_universe)
n_derived_total = len(derived_universe)

# Buckets sobre universe completo
n_status_agendado = len(agendado_contact_ids)  # ya incluye reactivados (= n_agend = 7)
n_status_derived_no_agend = len(derived_universe_ids - agendado_contact_ids)
n_status_only_ia = max(0, universe_size - n_status_agendado - n_status_derived_no_agend)

def insert_derived(funnel_arr, derived_count, spend):
    """Inserta etapa 'Derivado a ejecutivo' después de 'Contacto Realizado' si existe."""
    out = []
    inserted = False
    for item in funnel_arr:
        out.append(item)
        if not inserted and item['stage'] == 'Contacto Realizado':
            out.append({
                'stage': 'Derivado a ejecutivo',
                'count': derived_count,
                'cost_per': (spend / derived_count) if derived_count else None,
                'is_intermediate': True,  # marca para render distinto
            })
            inserted = True
    if not inserted and derived_count > 0:
        out.append({
            'stage': 'Derivado a ejecutivo',
            'count': derived_count,
            'cost_per': (spend / derived_count) if derived_count else None,
            'is_intermediate': True,
        })
    return out

funnel_total = [
    {'stage': 'Lead (creado)', 'count': len(contacts), 'cost_per': total_spend / len(contacts) if contacts else 0},
] + [
    {
        'stage': n,
        'count': stages_total_all[n],
        'cost_per': total_spend / stages_total_all[n] if stages_total_all[n] else None,
    }
    for n in STAGE_NAMES
]

# ─── Atribución por campaña ────────────────────────────────────────
def normalize_camp(name):
    if not name: return ''
    s = name.lower().strip()
    s = re.sub(r'\s+', ' ', s)
    return s

camp_spend = {}
camp_meta_idx = {}
for r in meta_rows:
    n = normalize_camp(r['campaign_name'])
    if n:
        camp_spend[n] = camp_spend.get(n, 0) + parse_float(r['spend'])
        camp_meta_idx[n] = {'platform': 'Meta', 'name': r['campaign_name'], 'pixel_leads': int(parse_float(r.get('actions_lead', 0))), 'clicks': int(parse_float(r['clicks'])), 'impr': int(parse_float(r['impressions']))}
for r in gads_rows:
    n = normalize_camp(r['campaign.name'])
    if n:
        camp_spend[n] = camp_spend.get(n, 0) + parse_float(r['metrics.cost'])
        camp_meta_idx[n] = {'platform': 'Google', 'name': r['campaign.name'], 'pixel_leads': int(parse_float(r['metrics.conversions'])), 'clicks': int(parse_float(r['metrics.clicks'])), 'impr': int(parse_float(r['metrics.impressions']))}

leads_per_camp = defaultdict(list)
for c in contacts:
    n = normalize_camp(c.get('utm_campaign', ''))
    leads_per_camp[n].append(c)

camp_table = []
all_camp_keys = set(camp_spend.keys()) | set(leads_per_camp.keys())
for ck in all_camp_keys:
    leads = leads_per_camp.get(ck, [])
    spend = camp_spend.get(ck, 0)
    info = camp_meta_idx.get(ck, {'platform': '—', 'name': leads[0].get('utm_campaign', ck) if leads else ck, 'pixel_leads': 0, 'clicks': 0, 'impr': 0})
    counts = stage_count_for([c['id'] for c in leads])
    n_leads = len(leads)
    n_agend_camp = counts.get('Agendado', 0)  # Asume "Agendado" como milestone — solo para CP-Agend en tabla
    camp_table.append({
        'platform': info['platform'],
        'name': info['name'],
        'spend': spend,
        'pixel_leads': info['pixel_leads'],
        'real_leads': n_leads,
        'cpl_real': (spend / n_leads) if n_leads > 0 else None,
        'cpl_pixel': (spend / info['pixel_leads']) if info['pixel_leads'] > 0 else None,
        'clicks': info['clicks'],
        'impr': info['impr'],
        'agendado': n_agend_camp,
        'cpa_agend': (spend / n_agend_camp) if n_agend_camp > 0 else None,
        'has_match': ck in camp_spend and len(leads) > 0,
        'no_leads': len(leads) == 0 and ck in camp_spend,
        'no_spend': ck not in camp_spend and len(leads) > 0,
    })
camp_table.sort(key=lambda x: -(x['spend'] or 0))

# ─── Por canal ─────────────────────────────────────────────────────
def channel_metrics(label, spend, clicks, impr, leads_list, pixel_leads):
    counts = stage_count_for(leads_list)
    n_leads = len(leads_list)
    return {
        'channel': label,
        'spend': spend,
        'clicks': clicks,
        'impr': impr,
        'pixel_leads': pixel_leads,
        'real_leads': n_leads,
        'cpl_real': (spend / n_leads) if n_leads > 0 else None,
        'cpl_pixel': (spend / pixel_leads) if pixel_leads > 0 else None,
        'agendado': counts.get('Agendado', 0),
        'cpa_agend': (spend / counts.get('Agendado', 0)) if counts.get('Agendado', 0) > 0 else None,
    }

channel_data = []
if LOAD_META:
    channel_data.append(channel_metrics('Meta Ads', meta_total_spend, meta_total_clicks, meta_total_impr, leads_meta, meta_total_leads_pixel))
if LOAD_GOOGLE:
    channel_data.append(channel_metrics('Google Ads', gads_total_spend, gads_total_clicks, gads_total_impr, leads_google, int(gads_total_conv)))
channel_data.append(channel_metrics('Otros (orgánico/direct)', 0, 0, 0, leads_other, 0))

# ─── Conversaciones ───────────────────────────────────────────────
inbound = [m for m in msgs if m['direction'].lower() == 'inbound']
outbound = [m for m in msgs if m['direction'].lower() == 'outbound']
contacts_responded = len(set(m['contactId'] for m in inbound))

engagement = {'no_response': 0, 'one_msg': 0, 'short': 0, 'long': 0}
for c in contacts:
    in_count = sum(1 for m in msgs_by_contact.get(c['id'], []) if m['direction'].lower() == 'inbound')
    if in_count == 0: engagement['no_response'] += 1
    elif in_count == 1: engagement['one_msg'] += 1
    elif in_count <= 4: engagement['short'] += 1
    else: engagement['long'] += 1

buckets_counts = Counter()
for c in contacts:
    n = len(msgs_by_contact.get(c['id'], []))
    if n == 0: buckets_counts['0'] += 1
    elif n <= 2: buckets_counts['1-2'] += 1
    elif n <= 5: buckets_counts['3-5'] += 1
    elif n <= 10: buckets_counts['6-10'] += 1
    else: buckets_counts['11+'] += 1

# Tabla de contactos
contact_rows = []
for c in contacts:
    cmsgs = msgs_by_contact.get(c['id'], [])
    in_c = sum(1 for m in cmsgs if m['direction'].lower() == 'inbound')
    out_c = sum(1 for m in cmsgs if m['direction'].lower() == 'outbound')
    last_date = cmsgs[-1]['dateAdded'][:10] if cmsgs else ''
    opp = opp_by_contact.get(c['id'], [{}])[0] if opp_by_contact.get(c['id']) else {}
    name = f"{c['firstName']} {c['lastName']}".strip() or c.get('email','') or c['id'][:8]
    contact_rows.append({
        'id': c['id'],
        'name': name,
        'phone': c.get('phone', ''),
        'email': c.get('email', ''),
        'source': src_of(c),
        'channel': src_normalized(c),
        'campaign': c.get('utm_campaign', ''),
        'utm_content': c.get('utm_content', ''),
        'stage': opp.get('stage', '(sin opp)'),
        'inbound': in_c,
        'outbound': out_c,
        'total': in_c + out_c,
        'last_date': last_date,
        'date_added': c.get('dateAdded', '')[:10],
    })

# Conversaciones completas
all_convs_full = {}
for c in contacts:
    cmsgs = msgs_by_contact.get(c['id'], [])
    if not cmsgs: continue
    name = f"{c['firstName']} {c['lastName']}".strip() or c.get('email','') or c['id'][:8]
    all_convs_full[c['id']] = {
        'name': name,
        'source': src_of(c),
        'campaign': c.get('utm_campaign', ''),
        'stage': (opp_by_contact.get(c['id'], [{}])[0] or {}).get('stage', ''),
        'messages': [
            {
                'date': m['dateAdded'][:16].replace('T', ' '),
                'dir': m['direction'].lower(),
                'body': m['body'][:600],
                'type': m['type'],
            }
            for m in cmsgs
            if m['type'] not in ('28', '31')
        ]
    }

# Agendados (todas las opps con stage Agendado y updatedAt en período)
# Incluye reactivaciones: leads viejos cuyo contact no está en contacts (filtered by period)
agendados_detail = []
for o in opps:
    if o['stage'] != 'Agendado': continue
    c_full = contact_by_id_all.get(o['contactId'], {})
    cmsgs = msgs_by_contact.get(o['contactId'], [])
    name = f"{c_full.get('firstName','')} {c_full.get('lastName','')}".strip()
    if not name:
        name = o.get('contactName', '') or o.get('contactEmail', '') or o['contactId'][:8]
    is_reactivated = bool(c_full) and not in_period(c_full.get('dateAdded', '')) or (not c_full)
    source = src_of(c_full) if c_full else (o.get('source', '') or '(sin atrib)')
    agendados_detail.append({
        'id': o['contactId'],
        'name': name,
        'source': source,
        'campaign': c_full.get('utm_campaign', '') if c_full else '',
        'utm_content': c_full.get('utm_content', '') if c_full else '',
        'msgs': len(cmsgs),
        'inbound': sum(1 for m in cmsgs if m['direction'].lower() == 'inbound'),
        'reactivated': is_reactivated,
        'lead_created': (c_full.get('dateAdded','') or o.get('createdAt',''))[:10],
        'scheduled_at': o.get('updatedAt', '')[:10],
    })
agendados_detail.sort(key=lambda a: a['scheduled_at'], reverse=True)

# Long no close
long_no_close = []
agendados_ids = set(o['contactId'] for o in opps if o['stage'] == 'Agendado')
for c in contacts:
    if c['id'] in agendados_ids: continue
    cmsgs = msgs_by_contact.get(c['id'], [])
    in_c = sum(1 for m in cmsgs if m['direction'].lower() == 'inbound')
    if in_c < 5: continue
    name = f"{c['firstName']} {c['lastName']}".strip() or c.get('email','') or c['id'][:8]
    long_no_close.append({
        'id': c['id'],
        'name': name,
        'source': src_of(c),
        'campaign': c.get('utm_campaign', ''),
        'stage': (opp_by_contact.get(c['id'], [{}])[0] or {}).get('stage', ''),
        'inbound': in_c,
        'outbound': len(cmsgs) - in_c,
    })
long_no_close.sort(key=lambda x: -x['inbound'])

# Timeline
by_day = defaultdict(lambda: {'inbound': 0, 'outbound': 0, 'new_contacts': 0})
for m in msgs:
    if not m['dateAdded']: continue
    d = m['dateAdded'][:10]
    if m['direction'].lower() == 'inbound': by_day[d]['inbound'] += 1
    elif m['direction'].lower() == 'outbound': by_day[d]['outbound'] += 1
for c in contacts:
    if c.get('dateAdded'):
        by_day[c['dateAdded'][:10]]['new_contacts'] += 1
days_sorted = sorted(by_day.keys())

# ─── KPI principales ───────────────────────────────────────────────
n_agend = sum(1 for o in opps if o['stage'] == 'Agendado')
n_agend_new = sum(1 for a in agendados_detail if not a['reactivated'])
n_agend_reactivated = n_agend - n_agend_new

kpis_global = {
    'spend': total_spend,
    'leads': len(contacts),
    'cpl': total_spend / len(contacts) if contacts else 0,
    'engaged': engagement['long'],
    'cp_engaged': total_spend / engagement['long'] if engagement['long'] else 0,
    'agendados': n_agend,
    'agendados_new': n_agend_new,
    'agendados_reactivated': n_agend_reactivated,
    'cp_agend': total_spend / n_agend if n_agend else 0,
    'responded': contacts_responded,
    'cp_responded': total_spend / contacts_responded if contacts_responded else 0,
    'visita': 0,
    'reserva': 0,
    'response_rate': round(100 * contacts_responded / len(contacts), 1) if contacts else 0,
    'inbound': len(inbound),
    'outbound': len(outbound),
    'msgs_total': len(msgs),
}

# ─── Periodo ───────────────────────────────────────────────────────
period_label = '(últimos 30 días)'
if meta_rows:
    period_label = f"{meta_rows[0].get('date_start','')} → {meta_rows[0].get('date_stop','')}"

# ─── Payload ───────────────────────────────────────────────────────
payload = {
    'meta': {
        'generated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'period': period_label,
        'project': PROJECT_LABEL,
        'channels': {'meta': LOAD_META, 'google': LOAD_GOOGLE},
        'conv_mode': CONV_MODE,
        'agent_label': AGENT_LABEL,
        'agent_label_short': AGENT_LABEL_SHORT,
        'conv_view_title': CONV_VIEW_TITLE,
    },
    'kpis': kpis_global,
    'channels': channel_data,
    'campaigns': camp_table,
    'funnel_total': funnel_total,
    'funnel_meta': [
        {'stage': 'Lead', 'count': len(leads_meta), 'cost_per': meta_total_spend / len(leads_meta) if leads_meta else 0},
    ] + [
        {'stage': n, 'count': stages_meta[n], 'cost_per': meta_total_spend / stages_meta[n] if stages_meta[n] else None}
        for n in STAGE_NAMES
    ],
    'funnel_google': [
        {'stage': 'Lead', 'count': len(leads_google), 'cost_per': gads_total_spend / len(leads_google) if leads_google else 0},
    ] + [
        {'stage': n, 'count': stages_google[n], 'cost_per': gads_total_spend / stages_google[n] if stages_google[n] else None}
        for n in STAGE_NAMES
    ],
    'pipeline_stages': PIPELINE_STAGES,
    'engagement': engagement,
    'msg_buckets': {'labels': list(buckets_counts.keys()), 'data': list(buckets_counts.values())},
    'timeline': {
        'labels': days_sorted,
        'new_contacts': [by_day[d]['new_contacts'] for d in days_sorted],
        'inbound': [by_day[d]['inbound'] for d in days_sorted],
        'outbound': [by_day[d]['outbound'] for d in days_sorted],
    },
    'contacts': contact_rows,
    'conversations': all_convs_full,
    'long_no_close': long_no_close,
    'agendados': agendados_detail,
    'lead_status': {
        'agendado': n_status_agendado,
        'agendado_new': n_agend_new,
        'agendado_reactivated': n_agend_reactivated,
        'derived_no_agend': n_status_derived_no_agend,
        'derived_total': n_derived_total,
        'only_ia': n_status_only_ia,
        'total': universe_size,
        'leads_new': len(contacts),
    },
    'derived': {
        'total': n_derived,
        'agendaron': n_derived_agendaron,
        'no_agendaron': n_derived - n_derived_agendaron,
        'pct_of_leads': round(100 * n_derived / len(contacts), 1) if contacts else 0,
        'pct_close_rate': round(100 * n_derived_agendaron / n_derived, 1) if n_derived else 0,
        'cost_per': (total_spend / n_derived) if n_derived else 0,
        'list': [
            {
                'id': c['id'],
                'name': f"{c.get('firstName','')} {c.get('lastName','')}".strip() or c.get('email','') or c['id'][:8],
                'source': src_of(c),
                'campaign': c.get('utm_campaign', ''),
                'date_added': c.get('dateAdded', '')[:10],
                'agendado': c['id'] in agendado_contact_ids,
            } for c in derived_contacts
        ],
    },
    'alerts_cfg': {
        'cpl_warn': CPL_WARN,
        'target_cpl': TARGET_CPL,
        'min_agend': MIN_AGEND,
    },
    'logo': logo_data,
}

# ─── HTML ──────────────────────────────────────────────────────────
HTML = '''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Dashboard Global — __PROJECT__</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: #453ede;
    --primary-dark: #322ba8;
    --primary-light: #5d57e0;
    --accent: #bac1e8;
    --accent-soft: #e3e6f7;
    --bg-light: #f0f3ff;
    --bg-page: #f7f9ff;
    --text-dark: #21282b;
    --border: #e5e7eb;
    --gray-50: #fafafa;
    --gray-100: #f3f4f6;
    --gray-500: #6b7280;
    --gray-700: #374151;
    --orange: #f59e0b;
    --red: #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Poppins', -apple-system, sans-serif;
    background: var(--bg-page);
    color: var(--text-dark);
    font-size: 14px;
    line-height: 1.5;
  }
  header {
    background: white;
    color: var(--text-dark);
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
  }
  header .logo-block { display: flex; align-items: center; gap: 16px; }
  header img { height: 36px; width: auto; }
  header .titles h1 { font-weight: 600; font-size: 18px; letter-spacing: -0.3px; color: var(--text-dark); }
  header .titles p { font-weight: 300; font-size: 12px; color: var(--gray-500); }
  header .meta-info { text-align: right; font-size: 12px; color: var(--gray-500); }
  nav.main-tabs {
    background: white;
    border-bottom: 1px solid var(--border);
    padding: 0 32px;
    display: flex;
    gap: 0;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  nav.main-tabs button {
    border: none;
    background: transparent;
    padding: 14px 20px;
    font-size: 13px;
    font-weight: 500;
    color: var(--gray-500);
    border-bottom: 2px solid transparent;
    border-radius: 0;
    transition: all 0.15s;
    font-family: inherit;
    cursor: pointer;
    letter-spacing: -0.1px;
  }
  nav.main-tabs button:hover { color: var(--primary); }
  nav.main-tabs button.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
    background: transparent;
  }
  .view { display: none; }
  .view.active { display: block; }
  .container { max-width: 1400px; margin: 0 auto; padding: 24px 32px; }
  section { margin-bottom: 24px; }
  h2 { font-weight: 600; font-size: 18px; color: var(--text-dark); margin-bottom: 12px; letter-spacing: -0.3px; }
  h3 { font-weight: 600; font-size: 14px; color: var(--text-dark); margin-bottom: 12px; }
  .card {
    background: white;
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(69,62,222,0.05);
    border: 1px solid var(--accent-soft);
  }
  .grid { display: grid; gap: 16px; }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  .grid-6 { grid-template-columns: repeat(6, 1fr); }
  @media (max-width: 1024px) {
    .grid-4 { grid-template-columns: repeat(2, 1fr); }
    .grid-6 { grid-template-columns: repeat(3, 1fr); }
  }
  .kpi {
    background: white;
    padding: 18px;
    border-radius: 10px;
    border-left: 4px solid var(--primary);
    box-shadow: 0 1px 3px rgba(69,62,222,0.05);
    border-top: 1px solid var(--accent-soft);
    border-right: 1px solid var(--accent-soft);
    border-bottom: 1px solid var(--accent-soft);
  }
  .kpi.kpi-primary { background: var(--primary); color: white; border-left-color: var(--primary-dark); border-top-color: var(--primary); border-right-color: var(--primary); border-bottom-color: var(--primary); }
  .kpi.kpi-soft { background: var(--bg-light); border-left-color: var(--primary-light); }
  .kpi.kpi-warn { border-left-color: var(--orange); }
  .kpi.kpi-bad { border-left-color: var(--red); }
  .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; font-weight: 500; }
  .kpi-value { font-size: 26px; font-weight: 600; margin-top: 4px; letter-spacing: -0.5px; }
  .kpi-detail { font-size: 11px; opacity: 0.8; margin-top: 4px; font-weight: 300; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 500; }
  .badge-meta { background: var(--primary); color: white; }
  .badge-google { background: var(--primary-light); color: white; }
  .badge-other { background: var(--accent); color: var(--text-dark); }
  .badge-info { background: var(--accent-soft); color: var(--primary-dark); }
  .badge-warn { background: #fed7aa; color: #9a3412; }
  .badge-bad { background: #fee2e2; color: #991b1b; }
  .badge-neutral { background: var(--gray-100); color: var(--gray-700); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 10px 8px; font-weight: 500; color: var(--gray-700); background: var(--gray-50); border-bottom: 1px solid var(--border); cursor: pointer; user-select: none; }
  th:hover { background: var(--bg-light); }
  td { padding: 10px 8px; border-bottom: 1px solid var(--gray-100); }
  tr:hover { background: var(--bg-light); }
  .text-right { text-align: right; }
  .text-mono { font-variant-numeric: tabular-nums; }
  .text-sm { font-size: 11px; }
  .text-muted { color: var(--gray-500); }
  .text-bold { font-weight: 600; }
  .text-primary { color: var(--primary); }
  .text-bad { color: var(--red); }
  button { font-family: inherit; cursor: pointer; border: 1px solid var(--border); background: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; transition: all 0.15s; }
  button:hover { border-color: var(--primary); color: var(--primary); }
  button.active { background: var(--primary); color: white; border-color: var(--primary); }
  input[type="text"] { font-family: inherit; width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }
  input[type="text"]:focus { outline: none; border-color: var(--primary); }
  select { font-family: inherit; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: white; cursor: pointer; }
  select:focus { outline: none; border-color: var(--primary); }
  .funnel-row { display: flex; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--gray-100); }
  .funnel-row:last-child { border-bottom: none; }
  .funnel-label { font-weight: 500; min-width: 160px; font-size: 13px; }
  .funnel-bar-bg { flex: 1; background: var(--gray-100); height: 28px; border-radius: 6px; overflow: hidden; position: relative; }
  .funnel-bar { height: 100%; background: linear-gradient(to right, var(--primary), var(--primary-light)); display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; color: white; font-size: 12px; font-weight: 500; }
  .funnel-meta { min-width: 120px; text-align: right; font-size: 12px; color: var(--gray-500); }
  .funnel-cost { min-width: 110px; text-align: right; font-size: 12px; color: var(--primary); font-weight: 500; }
  .modal-bg { position: fixed; inset: 0; background: rgba(33,40,43,0.45); display: none; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
  .modal-bg.show { display: flex; }
  .modal { background: white; border-radius: 12px; max-width: 720px; width: 100%; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
  .modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: start; }
  .modal-body { padding: 16px 20px; overflow-y: auto; background: var(--gray-50); flex: 1; }
  .bubble { max-width: 80%; padding: 10px 14px; border-radius: 14px; margin-bottom: 8px; word-wrap: break-word; font-size: 13px; }
  .bubble.inbound { background: white; border: 1px solid var(--border); margin-right: auto; border-bottom-left-radius: 4px; }
  .bubble.outbound { background: var(--primary); color: white; margin-left: auto; border-bottom-right-radius: 4px; }
  .bubble-meta { font-size: 10px; opacity: 0.7; margin-bottom: 4px; }
  .ribbon-info { background: linear-gradient(to right, var(--bg-light), white); border-left: 4px solid var(--primary); padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; }
  .ribbon-warn { background: linear-gradient(to right, #fef3c7, white); border-left: 4px solid var(--orange); padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; }
  .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
  .alert-warn { background: #fef3c7; color: #92400e; border-left: 4px solid var(--orange); }
  .alert-bad { background: #fee2e2; color: #991b1b; border-left: 4px solid var(--red); }
  .tab-bar { display: flex; gap: 4px; margin-bottom: 12px; }
  .tab { padding: 8px 16px; border-radius: 6px 6px 0 0; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--gray-500); border: none; background: transparent; }
  .tab.active { background: var(--primary); color: white; }
</style>
</head>
<body>
<header>
  <div class="logo-block">
    <img id="logo" src="" alt="Magnia" style="display:none">
    <div class="titles">
      <h1>Dashboard Global · __PROJECT__</h1>
      <p id="header-subtitle">—</p>
    </div>
  </div>
  <div class="meta-info">
    <div id="period">—</div>
    <div id="generated" style="opacity:0.7">—</div>
  </div>
</header>

<nav class="main-tabs">
  <button class="main-tab active" data-view="resumen">Resumen del período</button>
  <button class="main-tab" data-view="embudo">Embudo de conversión</button>
  <button class="main-tab" data-view="medios">Medios</button>
  <button class="main-tab" data-view="ia" id="tab-conv">Performance de conversaciones</button>
</nav>

<div class="container">

  <div class="view active" data-view="resumen">
    <section>
      <h2>Resumen del período</h2>
      <div class="grid grid-4" id="kpi-row-1"></div>
      <div class="grid grid-6" style="margin-top: 12px" id="kpi-row-2"></div>
    </section>
    <div id="alerts"></div>
  </div>

  <div class="view" data-view="embudo">
    <section>
      <h2>Embudo de conversión + costo por etapa</h2>
      <div class="tab-bar" id="funnel-tabs"></div>
      <div class="card">
        <div id="funnel-bars"></div>
        <p class="text-sm text-muted" style="margin-top: 12px" id="funnel-note"></p>
      </div>
    </section>
  </div>

  <div class="view" data-view="medios">
    <section>
      <h2>Performance por canal</h2>
      <div class="card">
        <p class="text-sm text-muted" style="margin-bottom:12px">
          La columna <b>Agendado</b> aquí solo cuenta agendamientos atribuidos a leads <b>nuevos</b> del período (vía UTM). Los agendamientos de leads reactivados se ven en el KPI total y en la lista de la pestaña "Performance de conversaciones".
        </p>
        <table>
          <thead><tr>
            <th>Canal</th>
            <th class="text-right">Spend</th>
            <th class="text-right">Impr.</th>
            <th class="text-right">Clicks</th>
            <th class="text-right">Leads (real)</th>
            <th class="text-right">CPL real</th>
            <th class="text-right">Agendado</th>
            <th class="text-right">CP-Agend</th>
          </tr></thead>
          <tbody id="channel-tbody"></tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Performance por campaña</h2>
      <div class="card">
        <p class="text-sm text-muted" style="margin-bottom:12px">
          <b>Leads (real)</b> = contactos en CRM atribuidos vía UTM. <b>CPL real</b> usa leads reales (más conservador). <b>CPL pixel</b> usa conversiones reportadas por la plataforma.
        </p>
        <div class="tab-bar" id="camp-filters"></div>
        <table id="camp-table" class="sortable">
          <thead><tr>
            <th>Plataforma</th>
            <th>Campaña</th>
            <th class="text-right">Spend</th>
            <th class="text-right">Leads (real)</th>
            <th class="text-right">CPL real</th>
            <th class="text-right">CPL pixel</th>
            <th class="text-right">Agend.</th>
            <th class="text-right">CP-Agend</th>
            <th>Status</th>
          </tr></thead>
          <tbody id="camp-tbody"></tbody>
        </table>
      </div>
    </section>
  </div>

  <div class="view" data-view="ia">
    <section>
      <h2>Estado final de los leads con actividad en el período</h2>
      <p class="text-sm text-muted" style="margin-bottom: 12px">
        Indicador clave de performance del agente IA. Universo: todos los contactos con opp activa en el período (incluye leads nuevos del período + reactivaciones de leads viejos cuya opp se movió en el período).
      </p>
      <div class="grid grid-2">
        <div class="card">
          <canvas id="chart-lead-status" height="240"></canvas>
        </div>
        <div class="card">
          <div id="lead-status-stats"></div>
        </div>
      </div>
    </section>

    <section>
      <h2 id="conv-h2">Engagement de conversaciones</h2>
      <div class="grid grid-2">
        <div class="card">
          <h3>Distribución de respuesta del lead</h3>
          <canvas id="chart-engagement" height="200"></canvas>
        </div>
        <div class="card">
          <h3>Distribución de # mensajes por contacto</h3>
          <canvas id="chart-buckets" height="200"></canvas>
        </div>
      </div>
    </section>

    <section>
      <h2>Timeline diario</h2>
      <div class="card">
        <canvas id="chart-timeline" height="100"></canvas>
      </div>
    </section>

    <section>
      <h2>Derivaciones a ejecutivo (<span id="derived-count"></span>)</h2>
      <p class="text-sm text-muted" style="margin-bottom: 12px">
        Contactos que la IA derivó al ejecutivo (etiqueta <code>asistencia requerida</code> en GHL). Indican que la IA no logró resolver la consulta y escaló.
      </p>
      <div class="grid grid-3" style="margin-bottom: 16px" id="derived-kpis"></div>
      <div id="derived-list"></div>
    </section>

    <section>
      <h2>Agendamientos del período (<span id="agend-count"></span>)</h2>
      <div id="agendados-list"></div>
    </section>

    <section>
      <h2>Conversaciones largas (5+ inbound) que NO agendaron</h2>
      <p class="text-sm text-muted" style="margin-bottom: 12px" id="long-note">—</p>
      <div id="long-list"></div>
    </section>

    <section>
      <h2>Todas las conversaciones (<span id="ct-count"></span>)</h2>
      <div class="card">
        <div class="tab-bar" id="ct-filters"></div>
        <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap">
          <input type="text" id="ct-search" placeholder="Buscar nombre, email, teléfono..." style="flex:2; min-width:240px">
          <select id="ct-campaign-filter" style="flex:1; min-width:200px"></select>
          <select id="ct-stage-filter" style="flex:1; min-width:160px"></select>
        </div>
        <table class="sortable">
          <thead><tr>
            <th>Nombre</th>
            <th>Canal</th>
            <th>Campaña</th>
            <th>Etapa</th>
            <th class="text-right">In</th>
            <th class="text-right">Out</th>
            <th>Última msg</th>
            <th>Ver</th>
          </tr></thead>
          <tbody id="ct-tbody"></tbody>
        </table>
      </div>
    </section>
  </div>

  <footer style="text-align: center; padding: 32px 0; color: var(--gray-500); font-size: 11px">
    <span style="color: var(--primary); font-weight: 600">Magnia</span> · Menos ruido. Más cierres.<br>
    Generado automáticamente desde CRM + Meta Marketing API__GADS_FOOTER__
  </footer>

</div>

<div class="modal-bg" id="modal" onclick="if(event.target.id==='modal')closeModal()">
  <div class="modal">
    <div class="modal-header">
      <div>
        <h3 id="modal-title">—</h3>
        <p class="text-sm text-muted" id="modal-meta">—</p>
      </div>
      <button onclick="closeModal()" style="font-size:18px;border:none">&times;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>

<script>
const DATA = __DATA__;
const $ = id => document.getElementById(id);
const fmt = n => n == null ? '—' : new Intl.NumberFormat('es-CL').format(Math.round(n));
const fmtMoney = n => n == null ? '—' : '$' + fmt(n);
const fmtPct = n => n == null ? '—' : n.toFixed(1) + '%';

const HAS_GOOGLE = DATA.meta.channels.google;
const HAS_META = DATA.meta.channels.meta;
const AGENT_LBL = DATA.meta.agent_label;
const CONV_TITLE = DATA.meta.conv_view_title;

if (DATA.logo) {
  const logo = $('logo');
  logo.src = DATA.logo;
  logo.style.display = 'block';
}

const channelsActive = [HAS_META && 'Meta Ads', HAS_GOOGLE && 'Google Ads'].filter(Boolean).join(' · ');
$('header-subtitle').textContent = `Performance integrado: CRM · ${channelsActive}`;
$('period').textContent = DATA.meta.period;
$('generated').textContent = 'Generado ' + DATA.meta.generated;
$('tab-conv').textContent = CONV_TITLE;
$('conv-h2').textContent = `Engagement con el ${AGENT_LBL}`;
$('long-note').textContent = `Leads con alto engagement que no cerraron. Click para ver conversación y diagnosticar el patrón del ${AGENT_LBL}.`;

// KPIs principales
const k = DATA.kpis;
$('kpi-row-1').innerHTML = `
  <div class="kpi kpi-primary">
    <div class="kpi-label">Spend total (30d)</div>
    <div class="kpi-value">${fmtMoney(k.spend)}</div>
    <div class="kpi-detail">CLP · todas las plataformas</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Leads reales</div>
    <div class="kpi-value">${k.leads}</div>
    <div class="kpi-detail">CPL blended ${fmtMoney(k.cpl)}</div>
  </div>
  <div class="kpi kpi-warn">
    <div class="kpi-label">Agendamientos</div>
    <div class="kpi-value">${k.agendados}</div>
    <div class="kpi-detail">${k.agendados_new} nuevos · ${k.agendados_reactivated} reactivados</div>
  </div>
  <div class="kpi kpi-bad">
    <div class="kpi-label">Costo por agendamiento</div>
    <div class="kpi-value">${fmtMoney(k.cp_agend)}</div>
    <div class="kpi-detail">Spend total / # agendados</div>
  </div>`;

$('kpi-row-2').innerHTML = `
  <div class="kpi"><div class="kpi-label">CP-Lead respondió</div><div class="kpi-value" style="font-size:20px">${fmtMoney(k.cp_responded)}</div><div class="kpi-detail">${k.responded} respondieron ≥1 vez</div></div>
  <div class="kpi"><div class="kpi-label">CP-Lead engaged (5+ resp)</div><div class="kpi-value" style="font-size:20px">${fmtMoney(k.cp_engaged)}</div><div class="kpi-detail">${k.engaged} engaged</div></div>
  <div class="kpi"><div class="kpi-label">Tasa de respuesta</div><div class="kpi-value" style="font-size:20px">${fmtPct(k.response_rate)}</div><div class="kpi-detail">leads que respondieron</div></div>
  <div class="kpi"><div class="kpi-label">Mensajes totales</div><div class="kpi-value" style="font-size:20px">${fmt(k.msgs_total)}</div><div class="kpi-detail">${k.inbound} in · ${k.outbound} out</div></div>
  <div class="kpi"><div class="kpi-label">CP-Visita atendida</div><div class="kpi-value" style="font-size:20px">—</div><div class="kpi-detail">Etapa por implementar</div></div>
  <div class="kpi"><div class="kpi-label">CP-Reserva</div><div class="kpi-value" style="font-size:20px">—</div><div class="kpi-detail">Etapa por implementar</div></div>`;

// Alertas
const alerts = [];
const A = DATA.alerts_cfg;
if (k.cpl > A.cpl_warn) {
  const gAds = DATA.channels.find(c => c.channel === 'Google Ads');
  const gMsg = gAds ? ` Revisar Google Ads — tiene CPL ${fmtMoney(gAds.cpl_real)} con ${gAds.agendado} agendamientos.` : '';
  alerts.push(`<div class="alert alert-bad">⚠ CPL blended ${fmtMoney(k.cpl)} es ${(k.cpl/A.target_cpl).toFixed(1)}x el target (${fmtMoney(A.target_cpl)}).${gMsg}</div>`);
}
if (k.agendados < A.min_agend) {
  alerts.push(`<div class="alert alert-warn">⚠ Solo ${k.agendados} agendamientos en 30 días. ${k.engaged} leads tuvieron conversación larga (5+ respuestas) — la oportunidad está en mejorar el cierre del ${AGENT_LBL}.</div>`);
}
$('alerts').innerHTML = alerts.join('');

// Funnel tabs (dinámicas según canales)
const funnelTabsHtml = ['<button class="tab active" data-tab="total">Total</button>'];
if (HAS_META) funnelTabsHtml.push('<button class="tab" data-tab="meta">Meta Ads</button>');
if (HAS_GOOGLE) funnelTabsHtml.push('<button class="tab" data-tab="google">Google Ads</button>');
$('funnel-tabs').innerHTML = funnelTabsHtml.join('');
$('funnel-note').innerHTML = 'En la vista <b>Total</b>, las etapas reflejan toda la actividad del período (incluye reactivaciones de leads viejos, por eso pueden no cuadrar 1:1 con la cohort "Lead creado"). Las vistas <b>Meta</b> y <b>Google</b> son cohorts puros: solo leads nuevos atribuidos a esa plataforma.';

function renderFunnel(which) {
  const data = which === 'meta' ? DATA.funnel_meta : which === 'google' ? DATA.funnel_google : DATA.funnel_total;
  const max = Math.max(...data.map(d => d.count));
  $('funnel-bars').innerHTML = data.map(d => {
    const pct = max ? (d.count / max * 100) : 0;
    const isFuture = d.cost_per === null && d.count === 0;
    return `
      <div class="funnel-row">
        <div class="funnel-label">${d.stage}${isFuture ? ' <span class="badge badge-neutral">por implementar</span>' : ''}</div>
        <div class="funnel-bar-bg">
          ${d.count > 0 ? `<div class="funnel-bar" style="width:${pct}%">${d.count}</div>` : `<div style="padding:6px;color:var(--gray-500);font-size:11px">0</div>`}
        </div>
        <div class="funnel-meta">${d.count} ${d.count === 1 ? 'unidad' : 'unidades'}</div>
        <div class="funnel-cost">${d.cost_per != null ? 'CP: ' + fmtMoney(d.cost_per) : '—'}</div>
      </div>`;
  }).join('');
}
renderFunnel('total');
$('funnel-tabs').addEventListener('click', e => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('#funnel-tabs .tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  renderFunnel(e.target.dataset.tab);
});

// Por canal
$('channel-tbody').innerHTML = DATA.channels.map(c => {
  const badge = c.channel === 'Meta Ads' ? 'badge-meta' : c.channel === 'Google Ads' ? 'badge-google' : 'badge-other';
  return `<tr>
    <td><span class="badge ${badge}">${c.channel}</span></td>
    <td class="text-right text-mono">${fmtMoney(c.spend)}</td>
    <td class="text-right text-mono">${fmt(c.impr)}</td>
    <td class="text-right text-mono">${fmt(c.clicks)}</td>
    <td class="text-right text-mono text-bold">${c.real_leads}</td>
    <td class="text-right text-mono ${c.cpl_real > DATA.alerts_cfg.cpl_warn ? 'text-bad' : ''}">${fmtMoney(c.cpl_real)}</td>
    <td class="text-right text-mono text-bold ${c.agendado === 0 && c.spend > 0 ? 'text-bad' : ''}">${c.agendado}</td>
    <td class="text-right text-mono ${c.cpa_agend > 1000000 ? 'text-bad' : c.cpa_agend == null ? 'text-muted' : ''}">${fmtMoney(c.cpa_agend)}</td>
  </tr>`;
}).join('');

// Por campaña (con filtros dinámicos)
const campFiltersHtml = ['<button class="tab active" data-filter="all">Todas</button>'];
if (HAS_GOOGLE) campFiltersHtml.push('<button class="tab" data-filter="Google">Google Ads</button>');
if (HAS_META) campFiltersHtml.push('<button class="tab" data-filter="Meta">Meta Ads</button>');
$('camp-filters').innerHTML = campFiltersHtml.join('');

let campFilter = 'all';
function renderCampaigns() {
  const rows = DATA.campaigns.filter(c => campFilter === 'all' || c.platform === campFilter);
  $('camp-tbody').innerHTML = rows.map(c => {
    const badge = c.platform === 'Meta' ? 'badge-meta' : c.platform === 'Google' ? 'badge-google' : 'badge-neutral';
    let status = '';
    if (c.no_spend) status = '<span class="badge badge-warn">Lead sin spend match</span>';
    else if (c.no_leads) status = '<span class="badge badge-warn">Spend sin leads atribuidos</span>';
    else if (c.has_match) status = '<span class="badge badge-info">Match completo</span>';
    return `<tr>
      <td><span class="badge ${badge}">${c.platform}</span></td>
      <td><span title="${c.name}">${c.name.length > 50 ? c.name.slice(0,50)+'…' : c.name}</span></td>
      <td class="text-right text-mono">${fmtMoney(c.spend)}</td>
      <td class="text-right text-mono text-bold">${c.real_leads}</td>
      <td class="text-right text-mono">${fmtMoney(c.cpl_real)}</td>
      <td class="text-right text-mono text-muted">${fmtMoney(c.cpl_pixel)}</td>
      <td class="text-right text-mono text-bold ${c.agendado > 0 ? 'text-primary' : ''}">${c.agendado}</td>
      <td class="text-right text-mono">${fmtMoney(c.cpa_agend)}</td>
      <td>${status}</td>
    </tr>`;
  }).join('');
}
renderCampaigns();
$('camp-filters').addEventListener('click', e => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('#camp-filters .tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  campFilter = e.target.dataset.filter;
  renderCampaigns();
});

// Estado final del lead (donut)
const LS = DATA.lead_status;
const lsTotal = LS.total || 1;
const pctAgend = (100 * LS.agendado / lsTotal).toFixed(1);
const pctDeriv = (100 * LS.derived_no_agend / lsTotal).toFixed(1);
const pctOnly = (100 * LS.only_ia / lsTotal).toFixed(1);
new Chart($('chart-lead-status'), {
  type: 'doughnut',
  data: {
    labels: [
      `Agendados (${pctAgend}%)`,
      `Derivados a ${AGENT_LBL === 'agente IA' ? 'ejecutivo' : AGENT_LBL} sin agendar (${pctDeriv}%)`,
      `Solo IA, sin cierre (${pctOnly}%)`,
    ],
    datasets: [{
      data: [LS.agendado, LS.derived_no_agend, LS.only_ia],
      backgroundColor: ['#453ede', '#f59e0b', '#bac1e8'],
      borderWidth: 0,
    }]
  },
  options: {
    plugins: {
      legend: { position: 'bottom', labels: { font: { family: 'Poppins', size: 11 }, padding: 14 } },
      tooltip: { callbacks: { label: ctx => `${ctx.label.split(' (')[0]}: ${ctx.parsed} contactos` } },
    },
    cutout: '55%',
  }
});
$('lead-status-stats').innerHTML = `
  <div style="display:flex;flex-direction:column;gap:14px;height:100%;justify-content:center">
    <div style="border-left:4px solid #453ede;padding:8px 12px;background:rgba(69,62,222,0.05);border-radius:4px">
      <div style="font-size:11px;text-transform:uppercase;color:var(--gray-500);font-weight:500">Agendados (total período)</div>
      <div style="font-size:28px;font-weight:600;color:#453ede">${LS.agendado} <span style="font-size:14px;color:var(--gray-500)">/ ${lsTotal}</span></div>
      <div style="font-size:12px;color:var(--gray-500)">${pctAgend}% del universo · ${LS.agendado_new} de leads nuevos + ${LS.agendado_reactivated} reactivados.</div>
    </div>
    <div style="border-left:4px solid #f59e0b;padding:8px 12px;background:rgba(245,158,11,0.05);border-radius:4px">
      <div style="font-size:11px;text-transform:uppercase;color:var(--gray-500);font-weight:500">Derivados a ejecutivo (total período)</div>
      <div style="font-size:28px;font-weight:600;color:#f59e0b">${LS.derived_total} <span style="font-size:14px;color:var(--gray-500)">total</span></div>
      <div style="font-size:12px;color:var(--gray-500)">${LS.derived_no_agend} aún sin agendar · ${LS.derived_total - LS.derived_no_agend} derivados que sí agendaron.</div>
    </div>
    <div style="border-left:4px solid #bac1e8;padding:8px 12px;background:rgba(186,193,232,0.15);border-radius:4px">
      <div style="font-size:11px;text-transform:uppercase;color:var(--gray-500);font-weight:500">Solo IA, sin cierre</div>
      <div style="font-size:28px;font-weight:600;color:var(--text-dark)">${LS.only_ia}</div>
      <div style="font-size:12px;color:var(--gray-500)">${pctOnly}% manejados por IA sin agendar ni escalar.</div>
    </div>
  </div>`;

// Engagement chart
new Chart($('chart-engagement'), {
  type: 'doughnut',
  data: {
    labels: ['No respondió', '1 mensaje', '2-4 mensajes', '5+ (engaged)'],
    datasets: [{
      data: [DATA.engagement.no_response, DATA.engagement.one_msg, DATA.engagement.short, DATA.engagement.long],
      backgroundColor: ['#ef4444', '#bac1e8', '#5d57e0', '#453ede'],
      borderWidth: 0,
    }]
  },
  options: { plugins: { legend: { position: 'bottom', labels: { font: { family: 'Poppins', size: 11 } } } } }
});

new Chart($('chart-buckets'), {
  type: 'bar',
  data: {
    labels: DATA.msg_buckets.labels.map(l => l + ' msgs'),
    datasets: [{ data: DATA.msg_buckets.data, backgroundColor: '#453ede', borderRadius: 4 }]
  },
  options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
});

new Chart($('chart-timeline'), {
  type: 'line',
  data: {
    labels: DATA.timeline.labels,
    datasets: [
      { label: 'Nuevos contactos', data: DATA.timeline.new_contacts, borderColor: '#453ede', backgroundColor: 'rgba(69,62,222,0.1)', tension: 0.2, fill: true },
      { label: 'Mensajes inbound', data: DATA.timeline.inbound, borderColor: '#5d57e0', backgroundColor: 'transparent', tension: 0.2 },
      { label: 'Mensajes outbound', data: DATA.timeline.outbound, borderColor: '#bac1e8', backgroundColor: 'transparent', tension: 0.2 },
    ]
  },
  options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } }, plugins: { legend: { labels: { font: { family: 'Poppins', size: 11 } } } } }
});

// Derivaciones a ejecutivo
const D = DATA.derived;
$('derived-count').textContent = D.total;
$('derived-kpis').innerHTML = `
  <div class="kpi kpi-warn">
    <div class="kpi-label">Derivados a ejecutivo</div>
    <div class="kpi-value">${D.total}</div>
    <div class="kpi-detail">${D.pct_of_leads}% de los leads del período</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">De los derivados, ¿cuántos agendaron?</div>
    <div class="kpi-value">${D.agendaron} <span style="font-size:14px;color:var(--gray-500)">/ ${D.total}</span></div>
    <div class="kpi-detail">${D.pct_close_rate}% tasa de cierre del ejecutivo</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Costo por derivación</div>
    <div class="kpi-value" style="font-size:22px">${fmtMoney(D.cost_per)}</div>
    <div class="kpi-detail">Spend total / # derivados</div>
  </div>`;
$('derived-list').innerHTML = D.list.length === 0
  ? '<p class="text-sm text-muted">Sin derivaciones en el período.</p>'
  : D.list.map(d => `
    <div class="ribbon-warn">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <div class="text-bold">${d.name} ${d.agendado ? '<span class="badge badge-info">Agendó</span>' : '<span class="badge badge-bad">Sin agendar</span>'}</div>
          <div class="text-sm text-muted">Source: <b>${d.source}</b> · Campaña: ${d.campaign || '—'} · Lead creado: ${d.date_added || '—'}</div>
        </div>
        <button onclick="openConversation('${d.id}')" class="text-primary">Ver conversación →</button>
      </div>
    </div>`).join('');

// Agendados
$('agend-count').textContent = DATA.agendados.length;
const reactCount = DATA.agendados.filter(a => a.reactivated).length;
const newCount = DATA.agendados.length - reactCount;
$('agendados-list').innerHTML = `
  <p class="text-sm text-muted" style="margin-bottom:12px">
    <b>${newCount}</b> de leads nuevos del período · <b>${reactCount}</b> de leads reactivados (creados antes del período).
  </p>
` + DATA.agendados.map(a => `
  <div class="ribbon-info">
    <div style="display:flex;justify-content:space-between;align-items:start">
      <div>
        <div class="text-bold">${a.name || 'Sin nombre'}${a.reactivated ? ' <span class="badge badge-warn">Reactivado</span>' : ' <span class="badge badge-info">Nuevo</span>'}</div>
        <div class="text-sm text-muted">Source: <b>${a.source}</b> · Campaña: ${a.campaign || '—'} · Anuncio: ${a.utm_content || '—'}</div>
        <div class="text-sm text-muted">Lead creado: ${a.lead_created || '—'} · Agendado: <b>${a.scheduled_at || '—'}</b> · ${a.msgs} mensajes (${a.inbound} del lead)</div>
      </div>
      <button onclick="openConversation('${a.id}')" class="text-primary">Ver conversación →</button>
    </div>
  </div>
`).join('');

// Long no close
$('long-list').innerHTML = DATA.long_no_close.map(l => `
  <div class="ribbon-warn">
    <div style="display:flex;justify-content:space-between;align-items:start">
      <div>
        <div class="text-bold">${l.name}</div>
        <div class="text-sm text-muted">Source: <b>${l.source}</b> · Campaña: ${l.campaign || '—'} · Etapa: ${l.stage || '—'}</div>
        <div class="text-sm text-muted">Lead respondió ${l.inbound} veces · ${AGENT_LBL} envió ${l.outbound}</div>
      </div>
      <button onclick="openConversation('${l.id}')" class="text-primary">Ver conversación →</button>
    </div>
  </div>
`).join('');

// Contactos: filtros
const ctFiltersHtml = ['<button class="tab active" data-filter="all">Todos</button>'];
if (HAS_META) ctFiltersHtml.push('<button class="tab" data-filter="meta">Meta</button>');
if (HAS_GOOGLE) ctFiltersHtml.push('<button class="tab" data-filter="google">Google</button>');
ctFiltersHtml.push('<button class="tab" data-filter="other">Otros</button>');
$('ct-filters').innerHTML = ctFiltersHtml.join('');

let currentFilter = 'all', currentSearch = '', currentCampaign = 'all', currentStage = 'all';
const uniqCampaigns = [...new Set(DATA.contacts.map(c => c.campaign).filter(Boolean))].sort();
const uniqStages = [...new Set(DATA.contacts.map(c => c.stage).filter(Boolean))].sort();
$('ct-campaign-filter').innerHTML = '<option value="all">Todas las campañas</option>' +
  uniqCampaigns.map(c => `<option value="${c.replace(/"/g,'&quot;')}">${c.length > 50 ? c.slice(0,50)+'…' : c}</option>`).join('');
$('ct-stage-filter').innerHTML = '<option value="all">Todas las etapas</option>' +
  uniqStages.map(s => `<option value="${s}">${s}</option>`).join('');

function renderContacts() {
  const filtered = DATA.contacts.filter(c => {
    if (currentFilter !== 'all' && c.channel !== currentFilter) return false;
    if (currentCampaign !== 'all' && c.campaign !== currentCampaign) return false;
    if (currentStage !== 'all' && c.stage !== currentStage) return false;
    if (currentSearch) {
      const blob = `${c.name} ${c.email} ${c.phone} ${c.campaign} ${c.utm_content}`.toLowerCase();
      if (!blob.includes(currentSearch.toLowerCase())) return false;
    }
    return true;
  });
  $('ct-count').textContent = filtered.length;
  $('ct-tbody').innerHTML = filtered.map(c => {
    const chBadge = c.channel === 'meta' ? 'badge-meta' : c.channel === 'google' ? 'badge-google' : 'badge-other';
    const stBadge = c.stage === 'Agendado' ? 'badge-info' : c.stage === 'Contacto Realizado' ? 'badge-warn' : 'badge-neutral';
    return `<tr>
      <td class="text-bold">${c.name}</td>
      <td><span class="badge ${chBadge}">${c.source}</span></td>
      <td class="text-sm">${(c.campaign || '—').slice(0, 35)}</td>
      <td><span class="badge ${stBadge}">${c.stage}</span></td>
      <td class="text-right text-mono">${c.inbound}</td>
      <td class="text-right text-mono">${c.outbound}</td>
      <td class="text-sm text-muted">${c.last_date}</td>
      <td><button onclick="openConversation('${c.id}')" class="text-primary text-sm">Ver →</button></td>
    </tr>`;
  }).join('');
}
$('ct-filters').addEventListener('click', e => {
  if (!e.target.classList.contains('tab')) return;
  document.querySelectorAll('#ct-filters .tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  currentFilter = e.target.dataset.filter;
  renderContacts();
});
$('ct-search').addEventListener('input', e => { currentSearch = e.target.value; renderContacts(); });
$('ct-campaign-filter').addEventListener('change', e => { currentCampaign = e.target.value; renderContacts(); });
$('ct-stage-filter').addEventListener('change', e => { currentStage = e.target.value; renderContacts(); });
renderContacts();

// Tabs principales
document.querySelectorAll('nav.main-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav.main-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`.view[data-view="${btn.dataset.view}"]`).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// Modal
function openConversation(id) {
  const c = DATA.conversations[id];
  if (!c) return;
  $('modal-title').textContent = c.name;
  $('modal-meta').textContent = `${c.source} · ${c.campaign || '—'} · Etapa: ${c.stage || '—'} · ${c.messages.length} mensajes`;
  $('modal-body').innerHTML = c.messages.map(m => `
    <div class="bubble ${m.dir}">
      <div class="bubble-meta">${m.date} · ${m.dir}</div>
      <div>${escapeHtml(m.body)}</div>
    </div>`).join('');
  $('modal').classList.add('show');
}
function closeModal() { $('modal').classList.remove('show'); }
function escapeHtml(t) { return (t||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Sortable tables
document.querySelectorAll('table.sortable').forEach(table => {
  table.querySelectorAll('th').forEach((th, idx) => {
    th.addEventListener('click', () => {
      const tbody = table.querySelector('tbody');
      const rows = [...tbody.querySelectorAll('tr')];
      const isAsc = th.dataset.sort !== 'asc';
      rows.sort((a, b) => {
        const av = a.children[idx].textContent.trim();
        const bv = b.children[idx].textContent.trim();
        const an = parseFloat(av.replace(/[^\\d.-]/g, ''));
        const bn = parseFloat(bv.replace(/[^\\d.-]/g, ''));
        if (!isNaN(an) && !isNaN(bn)) return isAsc ? an - bn : bn - an;
        return isAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      table.querySelectorAll('th').forEach(t => t.dataset.sort = '');
      th.dataset.sort = isAsc ? 'asc' : 'desc';
      rows.forEach(r => tbody.appendChild(r));
    });
  });
});
</script>
</body>
</html>
'''

date_str = OVERRIDE_DATE or datetime.now().strftime('%Y-%m-%d')
out_path = os.path.join(OUT_DIR, f'global-{date_str}.html')
gads_footer = ' + Google Ads API' if LOAD_GOOGLE else ''
html = (HTML
        .replace('__PROJECT__', PROJECT_LABEL)
        .replace('__GADS_FOOTER__', gads_footer)
        .replace('__DATA__', json.dumps(payload, ensure_ascii=False)))
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'Dashboard global generado: {out_path}')
print(f'Tamaño: {os.path.getsize(out_path)/1024:.0f} KB')
print(f'Project: {PROJECT_LABEL}')
print(f'Canales: Meta={LOAD_META} · Google={LOAD_GOOGLE} · Conv mode={CONV_MODE}')
print(f'Stages pipeline: {", ".join(STAGE_NAMES)}')
print(f'\nKPIs principales:')
print(f'  Spend total: ${total_spend:,.0f} CLP')
print(f'  Leads reales: {len(contacts)}')
print(f'  CPL blended: ${kpis_global["cpl"]:,.0f} CLP')
print(f'  Agendamientos: {n_agend}')
print(f'  CP-Agendamiento: ${kpis_global["cp_agend"]:,.0f} CLP')
print(f'\nEstado final de leads (universe={universe_size}):')
print(f'  Agendados:                 {n_status_agendado} ({n_agend_new} nuevos + {n_agend_reactivated} reactivados)')
print(f'  Derivados a ejecutivo:     {n_derived_total} total ({n_status_derived_no_agend} sin agendar, {n_derived_total - n_status_derived_no_agend} ya agendaron)')
print(f'  Solo IA, sin cierre:       {n_status_only_ia}')

print(f'\nPor canal:')
for ch in channel_data:
    print(f'  {ch["channel"]:30} spend ${ch["spend"]:>12,.0f} | leads {ch["real_leads"]:>3} | CPL ${ch["cpl_real"] or 0:>10,.0f} | agend {ch["agendado"]}')
