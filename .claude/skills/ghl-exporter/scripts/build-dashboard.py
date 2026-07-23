#!/usr/bin/env python3
"""Genera un dashboard HTML interactivo standalone con la data de GHL.
Output: created/dashboards/funnel-ghl-{date}.html
"""
import csv
import json
import os
from collections import defaultdict, Counter
from datetime import datetime, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
CRM_DIR = os.path.join(ROOT, 'context', 'crm')
OUT_DIR = os.path.join(ROOT, 'created', 'dashboards')
os.makedirs(OUT_DIR, exist_ok=True)

def load_csv(name):
    with open(os.path.join(CRM_DIR, name), encoding='utf-8') as f:
        return list(csv.DictReader(f))

contacts = load_csv('contacts.csv')
opps = load_csv('opportunities.csv')
opps_utm = load_csv('opportunities-with-utm.csv')
convs = load_csv('conversations.csv')
msgs = load_csv('messages.csv')

# Indexes
contact_by_id = {c['id']: c for c in contacts}
opp_by_contact = defaultdict(list)
for o in opps:
    opp_by_contact[o['contactId']].append(o)
opp_utm_by_contact = {o['contactId']: o for o in opps_utm}
msgs_by_contact = defaultdict(list)
for m in msgs:
    msgs_by_contact[m['contactId']].append(m)
for cid in msgs_by_contact:
    msgs_by_contact[cid].sort(key=lambda m: m['dateAdded'])

def src_of(c):
    return c.get('utm_source') or c.get('session_source') or c.get('source') or '(sin atrib)'

# ─── KPIs ────────────────────────────────────────────────────────────
total_contacts = len(contacts)
total_opps = len(opps)
total_convs = len(convs)
total_msgs = len(msgs)
inbound = [m for m in msgs if m['direction'].lower() == 'inbound']
outbound = [m for m in msgs if m['direction'].lower() == 'outbound']
contacts_responded = len(set(m['contactId'] for m in inbound))
agendados = [o for o in opps if o['stage'] == 'Agendado']
contactados = [o for o in opps if o['stage'] == 'Contacto Realizado']
nuevos = [o for o in opps if o['stage'] == 'Nuevo Prospecto']

kpis = {
    'total_contacts': total_contacts,
    'total_opps': total_opps,
    'total_convs': total_convs,
    'total_msgs': total_msgs,
    'inbound_msgs': len(inbound),
    'outbound_msgs': len(outbound),
    'contacts_responded': contacts_responded,
    'response_rate': round(100 * contacts_responded / total_contacts, 1) if total_contacts else 0,
    'agendados': len(agendados),
    'contactados': len(contactados),
    'nuevos': len(nuevos),
    'tasa_agendamiento': round(100 * len(agendados) / total_opps, 1) if total_opps else 0,
    'avg_msgs_per_contact': round(total_msgs / total_contacts, 1) if total_contacts else 0,
}

# ─── Embudo etapas ───────────────────────────────────────────────────
stages = ['Nuevo Prospecto', 'Contacto Realizado', 'Agendado']
stage_counts = [
    sum(1 for o in opps if o['stage'] == 'Nuevo Prospecto'),
    sum(1 for o in opps if o['stage'] == 'Contacto Realizado'),
    sum(1 for o in opps if o['stage'] == 'Agendado'),
]

# ─── Por fuente ──────────────────────────────────────────────────────
src_funnel = defaultdict(lambda: {'total': 0, 'nuevo': 0, 'contactado': 0, 'agendado': 0, 'responded': 0, 'avg_msgs': 0, 'total_msgs': 0})
for c in contacts:
    s = src_of(c)
    src_funnel[s]['total'] += 1
    src_funnel[s]['total_msgs'] += len(msgs_by_contact.get(c['id'], []))
    has_inbound = any(m['direction'].lower() == 'inbound' for m in msgs_by_contact.get(c['id'], []))
    if has_inbound: src_funnel[s]['responded'] += 1
    for o in opp_by_contact.get(c['id'], []):
        if o['stage'] == 'Nuevo Prospecto': src_funnel[s]['nuevo'] += 1
        elif o['stage'] == 'Contacto Realizado': src_funnel[s]['contactado'] += 1
        elif o['stage'] == 'Agendado': src_funnel[s]['agendado'] += 1
for s, d in src_funnel.items():
    d['avg_msgs'] = round(d['total_msgs'] / d['total'], 1) if d['total'] else 0
    d['pct_response'] = round(100 * d['responded'] / d['total'], 1) if d['total'] else 0
    d['pct_agendado'] = round(100 * d['agendado'] / d['total'], 1) if d['total'] else 0

src_data = [{'source': s, **d} for s, d in sorted(src_funnel.items(), key=lambda x: -x[1]['total'])]

# ─── Por campaña ─────────────────────────────────────────────────────
camp_funnel = defaultdict(lambda: {'total': 0, 'agendado': 0, 'responded': 0, 'total_msgs': 0})
for c in contacts:
    cn = c.get('utm_campaign') or '(sin campaña)'
    camp_funnel[cn]['total'] += 1
    camp_funnel[cn]['total_msgs'] += len(msgs_by_contact.get(c['id'], []))
    has_inbound = any(m['direction'].lower() == 'inbound' for m in msgs_by_contact.get(c['id'], []))
    if has_inbound: camp_funnel[cn]['responded'] += 1
    for o in opp_by_contact.get(c['id'], []):
        if o['stage'] == 'Agendado': camp_funnel[cn]['agendado'] += 1
camp_data = []
for cn, d in sorted(camp_funnel.items(), key=lambda x: -x[1]['total']):
    camp_data.append({
        'campaign': cn,
        'total': d['total'],
        'agendado': d['agendado'],
        'responded': d['responded'],
        'pct_response': round(100 * d['responded'] / d['total'], 1) if d['total'] else 0,
        'pct_agendado': round(100 * d['agendado'] / d['total'], 1) if d['total'] else 0,
        'avg_msgs': round(d['total_msgs'] / d['total'], 1) if d['total'] else 0,
    })

# ─── Distribución de mensajes por contacto ──────────────────────────
buckets_counts = Counter()
for c in contacts:
    n = len(msgs_by_contact.get(c['id'], []))
    if n == 0: buckets_counts['0'] += 1
    elif n <= 2: buckets_counts['1-2'] += 1
    elif n <= 5: buckets_counts['3-5'] += 1
    elif n <= 10: buckets_counts['6-10'] += 1
    else: buckets_counts['11+'] += 1
buckets = ['0', '1-2', '3-5', '6-10', '11+']
buckets_data = [buckets_counts.get(b, 0) for b in buckets]

# ─── Categorías de engagement ───────────────────────────────────────
engagement = {'no_response': 0, 'one_msg': 0, 'short': 0, 'long': 0}
for c in contacts:
    in_count = sum(1 for m in msgs_by_contact.get(c['id'], []) if m['direction'].lower() == 'inbound')
    if in_count == 0: engagement['no_response'] += 1
    elif in_count == 1: engagement['one_msg'] += 1
    elif in_count <= 4: engagement['short'] += 1
    else: engagement['long'] += 1

# ─── Drop-off: ¿quién dejó de responder? ────────────────────────────
last_dir = Counter()
for c in contacts:
    if msgs_by_contact.get(c['id']):
        last_dir[msgs_by_contact[c['id']][-1]['direction'].lower()] += 1

# ─── Tabla detallada de cada contacto ───────────────────────────────
contact_rows = []
for c in contacts:
    cmsgs = msgs_by_contact.get(c['id'], [])
    in_c = sum(1 for m in cmsgs if m['direction'].lower() == 'inbound')
    out_c = sum(1 for m in cmsgs if m['direction'].lower() == 'outbound')
    last_d = cmsgs[-1]['direction'].lower() if cmsgs else ''
    last_date = cmsgs[-1]['dateAdded'][:10] if cmsgs else ''
    opp = opp_by_contact.get(c['id'], [{}])[0] if opp_by_contact.get(c['id']) else {}
    name = f"{c['firstName']} {c['lastName']}".strip() or c.get('email','') or c['id'][:8]
    contact_rows.append({
        'id': c['id'],
        'name': name,
        'phone': c.get('phone', ''),
        'email': c.get('email', ''),
        'source': src_of(c),
        'campaign': c.get('utm_campaign', ''),
        'utm_content': c.get('utm_content', ''),
        'stage': opp.get('stage', '(sin opp)'),
        'inbound': in_c,
        'outbound': out_c,
        'total': in_c + out_c,
        'last_dir': last_dir,
        'last_date': last_date,
        'date_added': c.get('dateAdded', '')[:10],
    })

# ─── Conversaciones completas (por contacto) ─────────────────────────
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
            if m['type'] not in ('28', '31')  # filtrar eventos del sistema
        ]
    }

# ─── Mensajes por día (timeline) ─────────────────────────────────────
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
timeline_data = {
    'labels': days_sorted,
    'new_contacts': [by_day[d]['new_contacts'] for d in days_sorted],
    'inbound': [by_day[d]['inbound'] for d in days_sorted],
    'outbound': [by_day[d]['outbound'] for d in days_sorted],
}

# ─── Conversaciones largas que NO agendaron ─────────────────────────
long_no_close = []
agendados_ids = set(o['contactId'] for o in agendados)
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

# ─── Agendados con detalle ──────────────────────────────────────────
agendados_detail = []
for o in agendados:
    c = contact_by_id.get(o['contactId'], {})
    cmsgs = msgs_by_contact.get(o['contactId'], [])
    name = f"{c.get('firstName','')} {c.get('lastName','')}".strip()
    agendados_detail.append({
        'id': o['contactId'],
        'name': name,
        'source': src_of(c),
        'campaign': c.get('utm_campaign', ''),
        'utm_content': c.get('utm_content', ''),
        'msgs': len(cmsgs),
        'inbound': sum(1 for m in cmsgs if m['direction'].lower() == 'inbound'),
    })

# ─── Build the JSON payload ─────────────────────────────────────────
payload = {
    'meta': {
        'generated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'period': 'Últimos 30 días (2026-03-30 → 2026-04-29)',
        'project': 'Vista Los Naranjos',
    },
    'kpis': kpis,
    'stages': {'labels': stages, 'data': stage_counts},
    'sources': src_data,
    'campaigns': camp_data,
    'msg_buckets': {'labels': buckets, 'data': buckets_data},
    'engagement': engagement,
    'last_dir': dict(last_dir),
    'timeline': timeline_data,
    'contacts': contact_rows,
    'conversations': all_convs_full,
    'long_no_close': long_no_close,
    'agendados': agendados_detail,
}

# ─── HTML template ──────────────────────────────────────────────────
HTML = '''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Dashboard Embudo GHL — Agrícola Vista Los Naranjos</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .modal-bg { background: rgba(0,0,0,0.5); }
  .conversation-bubble { max-width: 75%; word-wrap: break-word; }
  .inbound { background: #f3f4f6; }
  .outbound { background: #dbeafe; }
  table.sortable th { cursor: pointer; user-select: none; }
  table.sortable th:hover { background: #e5e7eb; }
  .filter-active { background: #2563eb; color: white; }
  details summary::-webkit-details-marker { display:none; }
</style>
</head>
<body class="bg-gray-50 text-gray-900">
<div class="max-w-7xl mx-auto p-6">

  <!-- Header -->
  <header class="mb-8">
    <h1 class="text-3xl font-bold">Embudo GHL — Vista Los Naranjos</h1>
    <p class="text-gray-600 mt-1" id="meta-info"></p>
    <p class="text-sm text-gray-500 mt-1">Data: GoHighLevel | Período: <span id="period"></span> | Generado: <span id="generated"></span></p>
  </header>

  <!-- KPI Cards -->
  <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
    <div class="bg-white p-5 rounded-lg shadow border-l-4 border-blue-500">
      <div class="text-sm text-gray-500">Contactos (30d)</div>
      <div class="text-3xl font-bold mt-1" id="kpi-contacts">—</div>
    </div>
    <div class="bg-white p-5 rounded-lg shadow border-l-4 border-purple-500">
      <div class="text-sm text-gray-500">Conversaciones del agente IA</div>
      <div class="text-3xl font-bold mt-1" id="kpi-convs">—</div>
      <div class="text-xs text-gray-500" id="kpi-convs-pct"></div>
    </div>
    <div class="bg-white p-5 rounded-lg shadow border-l-4 border-amber-500">
      <div class="text-sm text-gray-500">Tasa de respuesta del lead</div>
      <div class="text-3xl font-bold mt-1" id="kpi-response">—</div>
      <div class="text-xs text-gray-500" id="kpi-response-detail"></div>
    </div>
    <div class="bg-white p-5 rounded-lg shadow border-l-4 border-red-500">
      <div class="text-sm text-gray-500">Tasa de agendamiento</div>
      <div class="text-3xl font-bold mt-1 text-red-600" id="kpi-agendado">—</div>
      <div class="text-xs text-gray-500" id="kpi-agendado-detail"></div>
    </div>
    <div class="bg-white p-5 rounded-lg shadow">
      <div class="text-sm text-gray-500">Mensajes totales</div>
      <div class="text-3xl font-bold mt-1" id="kpi-msgs">—</div>
      <div class="text-xs text-gray-500" id="kpi-msgs-detail"></div>
    </div>
    <div class="bg-white p-5 rounded-lg shadow">
      <div class="text-sm text-gray-500">Avg mensajes por contacto</div>
      <div class="text-3xl font-bold mt-1" id="kpi-avg-msgs">—</div>
    </div>
    <div class="bg-white p-5 rounded-lg shadow">
      <div class="text-sm text-gray-500">Conversaciones largas (5+ inbound)</div>
      <div class="text-3xl font-bold mt-1" id="kpi-long">—</div>
      <div class="text-xs text-gray-500" id="kpi-long-detail"></div>
    </div>
    <div class="bg-white p-5 rounded-lg shadow">
      <div class="text-sm text-gray-500">Drop-off del lead</div>
      <div class="text-3xl font-bold mt-1" id="kpi-dropoff">—</div>
      <div class="text-xs text-gray-500" id="kpi-dropoff-detail"></div>
    </div>
  </section>

  <!-- Embudo + Engagement -->
  <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
    <div class="bg-white p-6 rounded-lg shadow">
      <h3 class="font-semibold mb-3">Embudo por etapa de pipeline</h3>
      <canvas id="chart-funnel" height="220"></canvas>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
      <h3 class="font-semibold mb-3">Engagement: ¿cuánto responde el lead al agente?</h3>
      <canvas id="chart-engagement" height="220"></canvas>
    </div>
  </section>

  <!-- Por fuente y campaña -->
  <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
    <div class="bg-white p-6 rounded-lg shadow">
      <h3 class="font-semibold mb-3">Embudo por fuente UTM</h3>
      <canvas id="chart-source" height="240"></canvas>
      <p class="text-xs text-gray-500 mt-2">Tasa de agendamiento por fuente.</p>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
      <h3 class="font-semibold mb-3">Distribución de mensajes por contacto</h3>
      <canvas id="chart-buckets" height="240"></canvas>
    </div>
  </section>

  <!-- Tabla por fuente -->
  <section class="bg-white p-6 rounded-lg shadow mb-8">
    <h3 class="font-semibold mb-3">Detalle por fuente UTM</h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-100"><tr>
          <th class="text-left p-2">Fuente</th>
          <th class="text-right p-2">Total</th>
          <th class="text-right p-2">Respondió</th>
          <th class="text-right p-2">% resp.</th>
          <th class="text-right p-2">Avg msgs</th>
          <th class="text-right p-2">Nuevo</th>
          <th class="text-right p-2">Contactado</th>
          <th class="text-right p-2">Agendado</th>
          <th class="text-right p-2">% agend.</th>
        </tr></thead>
        <tbody id="src-tbody"></tbody>
      </table>
    </div>
  </section>

  <!-- Tabla por campaña -->
  <section class="bg-white p-6 rounded-lg shadow mb-8">
    <h3 class="font-semibold mb-3">Detalle por campaña UTM</h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm sortable">
        <thead class="bg-gray-100"><tr>
          <th class="text-left p-2">Campaña</th>
          <th class="text-right p-2">Total</th>
          <th class="text-right p-2">Respondió</th>
          <th class="text-right p-2">% resp.</th>
          <th class="text-right p-2">Avg msgs</th>
          <th class="text-right p-2">Agendado</th>
          <th class="text-right p-2">% agend.</th>
        </tr></thead>
        <tbody id="camp-tbody"></tbody>
      </table>
    </div>
  </section>

  <!-- Timeline -->
  <section class="bg-white p-6 rounded-lg shadow mb-8">
    <h3 class="font-semibold mb-3">Timeline diario — leads y mensajes</h3>
    <canvas id="chart-timeline" height="200"></canvas>
  </section>

  <!-- Agendados -->
  <section class="bg-white p-6 rounded-lg shadow mb-8 border-l-4 border-green-500">
    <h3 class="font-semibold mb-3 text-green-700">✓ Agendamientos del período (<span id="agend-count"></span>)</h3>
    <div id="agendados-list"></div>
  </section>

  <!-- Long no close -->
  <section class="bg-white p-6 rounded-lg shadow mb-8 border-l-4 border-orange-500">
    <h3 class="font-semibold mb-3 text-orange-700">⚠ Conversaciones largas (5+ inbound) que NO agendaron</h3>
    <p class="text-sm text-gray-600 mb-3">Estos leads tuvieron alto engagement pero no se cerró el agendamiento. Ver conversación para diagnóstico.</p>
    <div id="long-list"></div>
  </section>

  <!-- Tabla de contactos con filtros -->
  <section class="bg-white p-6 rounded-lg shadow mb-8">
    <h3 class="font-semibold mb-3">Todos los contactos (<span id="ct-count"></span>)</h3>
    <div class="flex gap-2 mb-3 flex-wrap" id="ct-filters">
      <button class="px-3 py-1 border rounded text-sm filter-btn filter-active" data-filter="all">Todos</button>
    </div>
    <input type="text" id="ct-search" placeholder="Buscar nombre, email, campaña..." class="w-full p-2 border rounded mb-3 text-sm">
    <div class="overflow-x-auto">
      <table class="w-full text-sm sortable">
        <thead class="bg-gray-100"><tr>
          <th class="text-left p-2">Nombre</th>
          <th class="text-left p-2">Fuente</th>
          <th class="text-left p-2">Campaña</th>
          <th class="text-left p-2">Etapa</th>
          <th class="text-right p-2">In</th>
          <th class="text-right p-2">Out</th>
          <th class="text-left p-2">Última msg</th>
          <th class="text-left p-2">Ver</th>
        </tr></thead>
        <tbody id="ct-tbody"></tbody>
      </table>
    </div>
  </section>

</div>

<!-- Modal: conversación completa -->
<div id="modal" class="hidden fixed inset-0 modal-bg flex items-center justify-center z-50 p-4">
  <div class="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
    <div class="p-4 border-b flex justify-between items-center">
      <div>
        <h3 class="font-semibold" id="modal-title">—</h3>
        <p class="text-xs text-gray-500" id="modal-meta">—</p>
      </div>
      <button onclick="closeModal()" class="text-gray-500 hover:text-black text-2xl">&times;</button>
    </div>
    <div id="modal-body" class="p-4 overflow-y-auto flex-1 space-y-2 bg-gray-50"></div>
  </div>
</div>

<script>
const DATA = __DATA__;

// Helpers
const $ = id => document.getElementById(id);

// Meta
$('period').textContent = DATA.meta.period;
$('generated').textContent = DATA.meta.generated;
$('meta-info').textContent = `Proyecto: ${DATA.meta.project}`;

// KPIs
const k = DATA.kpis;
$('kpi-contacts').textContent = k.total_contacts;
$('kpi-convs').textContent = k.total_convs;
$('kpi-convs-pct').textContent = `${Math.round(100*k.total_convs/k.total_contacts)}% de los contactos`;
$('kpi-response').textContent = k.response_rate + '%';
$('kpi-response-detail').textContent = `${k.contacts_responded} de ${k.total_contacts} respondieron`;
$('kpi-agendado').textContent = k.tasa_agendamiento + '%';
$('kpi-agendado-detail').textContent = `${k.agendados} agendados de ${k.total_opps}`;
$('kpi-msgs').textContent = k.total_msgs;
$('kpi-msgs-detail').textContent = `${k.inbound_msgs} inbound · ${k.outbound_msgs} outbound`;
$('kpi-avg-msgs').textContent = k.avg_msgs_per_contact;
$('kpi-long').textContent = DATA.engagement.long;
$('kpi-long-detail').textContent = `${Math.round(100*DATA.engagement.long/k.total_contacts)}% del total`;
$('kpi-dropoff').textContent = (DATA.last_dir.outbound || 0);
$('kpi-dropoff-detail').textContent = `Últ. mensaje del agente sin respuesta`;

// Embudo
new Chart($('chart-funnel'), {
  type: 'bar',
  data: {
    labels: DATA.stages.labels,
    datasets: [{
      data: DATA.stages.data,
      backgroundColor: ['#94a3b8', '#fbbf24', '#10b981'],
    }]
  },
  options: {
    indexAxis: 'y',
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} oportunidades (${(100*ctx.parsed.x/k.total_opps).toFixed(1)}%)` } } },
    scales: { x: { beginAtZero: true } }
  }
});

// Engagement
new Chart($('chart-engagement'), {
  type: 'doughnut',
  data: {
    labels: ['No respondió', '1 mensaje', '2-4 mensajes', '5+ mensajes (engaged)'],
    datasets: [{
      data: [DATA.engagement.no_response, DATA.engagement.one_msg, DATA.engagement.short, DATA.engagement.long],
      backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'],
    }]
  }
});

// By source
new Chart($('chart-source'), {
  type: 'bar',
  data: {
    labels: DATA.sources.map(s => s.source),
    datasets: [
      { label: 'Total leads', data: DATA.sources.map(s => s.total), backgroundColor: '#94a3b8' },
      { label: 'Respondieron', data: DATA.sources.map(s => s.responded), backgroundColor: '#3b82f6' },
      { label: 'Agendaron', data: DATA.sources.map(s => s.agendado), backgroundColor: '#10b981' },
    ]
  },
  options: {
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: true } }
  }
});

// Buckets
new Chart($('chart-buckets'), {
  type: 'bar',
  data: {
    labels: DATA.msg_buckets.labels.map(l => l + ' msgs'),
    datasets: [{ data: DATA.msg_buckets.data, backgroundColor: '#3b82f6' }]
  },
  options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
});

// Timeline
new Chart($('chart-timeline'), {
  type: 'line',
  data: {
    labels: DATA.timeline.labels,
    datasets: [
      { label: 'Nuevos contactos', data: DATA.timeline.new_contacts, borderColor: '#3b82f6', backgroundColor: 'transparent', tension: 0.2 },
      { label: 'Mensajes inbound', data: DATA.timeline.inbound, borderColor: '#10b981', backgroundColor: 'transparent', tension: 0.2 },
      { label: 'Mensajes outbound', data: DATA.timeline.outbound, borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.2 },
    ]
  },
  options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } } }
});

// Tabla source
$('src-tbody').innerHTML = DATA.sources.map(s => `
  <tr class="border-b">
    <td class="p-2 font-medium">${s.source}</td>
    <td class="p-2 text-right">${s.total}</td>
    <td class="p-2 text-right">${s.responded}</td>
    <td class="p-2 text-right">${s.pct_response}%</td>
    <td class="p-2 text-right">${s.avg_msgs}</td>
    <td class="p-2 text-right text-gray-500">${s.nuevo}</td>
    <td class="p-2 text-right text-amber-600">${s.contactado}</td>
    <td class="p-2 text-right font-bold text-green-600">${s.agendado}</td>
    <td class="p-2 text-right">${s.pct_agendado}%</td>
  </tr>
`).join('');

// Tabla campañas
$('camp-tbody').innerHTML = DATA.campaigns.map(c => `
  <tr class="border-b">
    <td class="p-2 truncate max-w-md" title="${c.campaign}">${c.campaign}</td>
    <td class="p-2 text-right">${c.total}</td>
    <td class="p-2 text-right">${c.responded}</td>
    <td class="p-2 text-right">${c.pct_response}%</td>
    <td class="p-2 text-right">${c.avg_msgs}</td>
    <td class="p-2 text-right font-bold ${c.agendado > 0 ? 'text-green-600' : 'text-gray-400'}">${c.agendado}</td>
    <td class="p-2 text-right">${c.pct_agendado}%</td>
  </tr>
`).join('');

// Agendados
$('agend-count').textContent = DATA.agendados.length;
$('agendados-list').innerHTML = DATA.agendados.map(a => `
  <div class="border rounded p-3 mb-2 bg-green-50">
    <div class="flex justify-between items-start">
      <div>
        <div class="font-semibold">${a.name || 'Sin nombre'}</div>
        <div class="text-sm text-gray-600">Source: <b>${a.source}</b> · Campaña: ${a.campaign || '—'} · Anuncio: ${a.utm_content || '—'}</div>
        <div class="text-xs text-gray-500">${a.msgs} mensajes (${a.inbound} del lead)</div>
      </div>
      <button onclick="openConversation('${a.id}')" class="text-blue-600 hover:underline text-sm">Ver conversación →</button>
    </div>
  </div>
`).join('');

// Long no close
$('long-list').innerHTML = DATA.long_no_close.map(l => `
  <div class="border rounded p-3 mb-2 bg-orange-50">
    <div class="flex justify-between items-start">
      <div>
        <div class="font-semibold">${l.name}</div>
        <div class="text-sm text-gray-600">Source: <b>${l.source}</b> · Campaña: ${l.campaign || '—'} · Etapa: ${l.stage || '—'}</div>
        <div class="text-xs text-gray-500">Lead respondió ${l.inbound} veces · Agente envió ${l.outbound}</div>
      </div>
      <button onclick="openConversation('${l.id}')" class="text-blue-600 hover:underline text-sm">Ver conversación →</button>
    </div>
  </div>
`).join('');

// Filtros
const sources = ['all', ...new Set(DATA.contacts.map(c => c.source))];
const filterContainer = $('ct-filters');
sources.slice(1).forEach(s => {
  const b = document.createElement('button');
  b.className = 'px-3 py-1 border rounded text-sm filter-btn';
  b.dataset.filter = s;
  b.textContent = s;
  filterContainer.appendChild(b);
});

let currentFilter = 'all';
let currentSearch = '';

function renderContacts() {
  const filtered = DATA.contacts.filter(c => {
    if (currentFilter !== 'all' && c.source !== currentFilter) return false;
    if (currentSearch) {
      const blob = `${c.name} ${c.email} ${c.phone} ${c.campaign} ${c.utm_content}`.toLowerCase();
      if (!blob.includes(currentSearch.toLowerCase())) return false;
    }
    return true;
  });
  $('ct-count').textContent = filtered.length;
  $('ct-tbody').innerHTML = filtered.map(c => `
    <tr class="border-b hover:bg-gray-50">
      <td class="p-2 font-medium">${c.name}</td>
      <td class="p-2"><span class="px-2 py-0.5 text-xs rounded ${badgeColor(c.source)}">${c.source}</span></td>
      <td class="p-2 text-xs truncate max-w-xs" title="${c.campaign}">${(c.campaign || '—').slice(0, 30)}</td>
      <td class="p-2"><span class="px-2 py-0.5 text-xs rounded ${stageColor(c.stage)}">${c.stage}</span></td>
      <td class="p-2 text-right">${c.inbound}</td>
      <td class="p-2 text-right">${c.outbound}</td>
      <td class="p-2 text-xs">${c.last_date}</td>
      <td class="p-2"><button onclick="openConversation('${c.id}')" class="text-blue-600 hover:underline text-xs">Ver →</button></td>
    </tr>
  `).join('');
}

function badgeColor(s) {
  if (s === 'fb_ad') return 'bg-blue-100 text-blue-800';
  if (s === 'adwords') return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-700';
}
function stageColor(s) {
  if (s === 'Agendado') return 'bg-green-100 text-green-800';
  if (s === 'Contacto Realizado') return 'bg-amber-100 text-amber-800';
  if (s === 'Nuevo Prospecto') return 'bg-gray-100 text-gray-700';
  return 'bg-gray-100 text-gray-500';
}

filterContainer.addEventListener('click', e => {
  if (!e.target.classList.contains('filter-btn')) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('filter-active'));
  e.target.classList.add('filter-active');
  currentFilter = e.target.dataset.filter;
  renderContacts();
});

$('ct-search').addEventListener('input', e => {
  currentSearch = e.target.value;
  renderContacts();
});

renderContacts();

// Modal de conversación
function openConversation(id) {
  const c = DATA.conversations[id];
  if (!c) return alert('Conversación no encontrada');
  $('modal-title').textContent = c.name;
  $('modal-meta').textContent = `${c.source} | ${c.campaign || '—'} | Etapa: ${c.stage || '—'} | ${c.messages.length} mensajes`;
  $('modal-body').innerHTML = c.messages.map(m => {
    const cls = m.dir === 'inbound' ? 'inbound mr-auto' : 'outbound ml-auto';
    return `<div class="conversation-bubble p-3 rounded-lg ${cls}">
      <div class="text-xs text-gray-500 mb-1">${m.date} · ${m.dir}</div>
      <div class="text-sm whitespace-pre-wrap">${escapeHtml(m.body)}</div>
    </div>`;
  }).join('');
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }
function escapeHtml(t) { return t.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

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

date_str = datetime.now().strftime('%Y-%m-%d')
out_path = os.path.join(OUT_DIR, f'funnel-ghl-{date_str}.html')
html = HTML.replace('__DATA__', json.dumps(payload, ensure_ascii=False))
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'Dashboard generado: {out_path}')
print(f'Tamaño: {os.path.getsize(out_path)/1024:.0f} KB')
print(f'Abrir con: start "" "{out_path}"  (Windows)')
