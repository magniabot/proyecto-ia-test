# Review HTML — Authoring Guide

A reviewable **HTML companion** to the CSV that every `feed-optimizer` action emits. The CSV stays
the source of truth (and what the user imports); the HTML is a *read-only review surface* that makes
an old→new diff far easier to scan than a spreadsheet. Claude authors it, writes it next to the CSV,
and **opens it automatically** so the user sees it without hunting for a file.

This guide is intentionally **pointers, not a rigid template**. The branding (the `<style>` block and
the logo) is fixed so every artifact looks like one product; the *body structure is yours to shape*
per action — a side-by-side prose diff for `content`, an attribute-cell grid for `small-attributes`,
a before/after mapping table for the deterministic actions (`product-type`, `taxonomy`,
`custom-label`).

## When to build it

- **Sample reviews** (`small-attributes` SA-2, `content` C-2): build the HTML from the same data you
  wrote to `sample-review.csv`. This is the primary ask — the sample is the approval gate, so make it
  pleasant to review. Rebuild it on every re-run (new seed / steering) so it always reflects the
  latest sample.
- **Final outputs** (any action's diff): optionally build it from `diff.csv` / the mapping CSV so the
  user can eyeball the full change set before importing.

## Hard rules

1. **Self-contained, single file.** Inline all CSS (use the block below verbatim). No external
   stylesheets, no CDN, no network fonts — this file is opened from a job dir in a client workspace
   where the PPC Mastery brand assets do **not** exist. Geist is named first in the font stack with a
   full system fallback; that is the intended behavior.
2. **HTML-escape every feed value.** Titles/descriptions contain `<`, `>`, `&`, quotes, and even raw
   HTML/URLs (those are exactly the weaknesses `content` rewrites). Escape all injected values or the
   page breaks. Inject data as escaped text — never build a row by concatenating unescaped feed
   strings.
3. **Read-only.** No forms, no "apply" buttons, no fetch. The HTML never implies the change is live —
   it is a preview of a CSV the user imports themselves.
4. **Don't bloat.** For large samples cap the rendered rows (e.g. first 200) and state the cap in the
   footer; the CSV remains complete. Product images, when shown, use the existing `image_link` URL in
   an `<img loading="lazy">` — never download or embed them.

## Standard layout — master / detail "inbox"

The default for the **sample reviews** (`small-attributes`, `content`) is a two-pane inbox: a
scannable product **list** on the left, a focused **diff detail** pane on the right. This won a layout
bake-off against editorial-stacked, field-grouped-tabs, and a dense grid — the per-product status dots
make triage (which products need attention?) instant, and the detail pane keeps the old→new diff
readable. Use it unless you have a reason not to; for the deterministic actions' final `diff.html`, a
simpler before/after table is fine.

- **Header** — the logo + a title naming the action and job id, and a one-line "review only — nothing
  is applied; import the CSV yourself" reminder. (Header markup below; paste verbatim.)
- **Summary stat cards** — the counts you already print to the console: products in sample, cells
  written / filled, abstained / rejected, fill or rewrite rate, model + seed, and (if loaded) the
  brand-voice source (use **basenames**, not full paths, or they overflow the card). Shape of the run
  at a glance.
- **Left list — one row per product.** Show the product id, the (rewritten or original) title, and a
  row of **status dots** — one per field, colored by status — so the user can spot products with
  abstentions/rejections without opening them. Clicking a product loads it into the detail pane;
  highlight the selected row. Make the list independently scrollable (`max-height` + `overflow-y`).
- **Right detail — the selected product's diff.** Per changed field show **old → new side by side**
  (`white-space:pre-wrap` for prose), with the field name, the status + confidence badges, and the
  short evidence line. Render multi-value fields (`product_highlight`, `product_detail`) as **bullet
  lists**, not a comma-joined blob — pull the structured arrays from `sample-results.json`
  (`proposed.<field>.value`); the flattened CSV string is the fallback.
- **Footer** — the path of the CSV the user actually imports, any row cap you applied, and a note that
  this page is a read-only review companion.

Keep all JS tiny, vanilla, and inline (selection handling is the only logic needed); the page must
work with no network.

## Branding — paste this `<style>` and header verbatim

Self-contained PPC Mastery brand tokens (mirrored from `ppcos-review/brand`). Use these classes;
don't invent new colors.

```html
<style>
  :root{
    --navy:#0C0A3E; --navy-5:#09082D; --navy-4:#1E406F;
    --blue:#2F5BFF; --blue-deep:#0C57BD;
    --bg:#FBFCFD; --card:#F7F5FF; --chip:#E1F0FF;
    --orange:#F48C06; --green:#2E9E5B; --red:#E05555; --amber:#B7791F;
    --muted:#6B7280; --subtle:#4B5563; --border:#DFDFDF; --text:#0C0A3E;
    --grad-navy:linear-gradient(94deg,#0C0A3E 0%,#09082D 30%,#09082D 60%,#1E406F 100%);
    --shadow:0 1px 2px rgba(12,10,62,.06),0 8px 24px rgba(12,10,62,.06);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);padding-bottom:40px;
    font-family:"Geist","Geist Variable",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
  h1,h2{margin:0}
  .wrap{max-width:1240px;margin:0 auto;padding:0 24px}
  /* header */
  header.hero{background:var(--grad-navy);color:#fff;padding:22px 0;margin-bottom:8px}
  header.hero .row{display:flex;align-items:center;gap:14px;max-width:1240px;margin:0 auto;padding:0 24px}
  header.hero .logo{width:34px;height:34px;flex:0 0 auto}
  header.hero h1{font-size:19px;font-weight:700;letter-spacing:-.3px}
  header.hero p{margin:2px 0 0;color:#C9D2E8;font-size:12.5px}
  header.hero code{color:#C9D2E8;background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px}
  /* stat cards */
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:20px 0}
  .card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:var(--shadow)}
  .card .n{font-size:24px;font-weight:800;line-height:1.1;word-break:break-word}
  .card .n.sm{font-size:14px}
  .card .l{color:var(--muted);font-size:11px;margin-top:5px;text-transform:uppercase;letter-spacing:.4px}
  /* badges + chips */
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700;line-height:1.6;letter-spacing:.2px}
  .badge.filled{background:rgba(46,158,91,.12);color:var(--green)}
  .badge.abstained{background:rgba(183,121,31,.13);color:var(--amber)}
  .badge.rejected{background:rgba(224,85,85,.13);color:var(--red)}
  .conf{font-size:10.5px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
  .chip{background:var(--chip);color:var(--blue-deep);border-radius:6px;padding:1px 7px;font-size:11.5px;font-weight:600}
  .field-name{font-weight:700;text-transform:capitalize;color:var(--subtle)}
  .empty{color:var(--muted);font-style:italic}
  ul.vals{margin:4px 0 0;padding-left:18px} ul.vals li{margin:2px 0}
  .stat-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
  .stat-dot.filled{background:var(--green)} .stat-dot.abstained{background:var(--amber)} .stat-dot.rejected{background:var(--red)}
  /* two-pane split */
  .split{display:grid;grid-template-columns:320px 1fr;gap:18px;margin-top:18px;align-items:start}
  .list{border:1px solid var(--border);border-radius:12px;background:#fff;overflow:hidden;box-shadow:var(--shadow);max-height:78vh;overflow-y:auto}
  .li{padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;flex-direction:column;gap:6px}
  .li:hover{background:var(--card)}
  .li.sel{background:var(--card);box-shadow:inset 3px 0 0 var(--blue)}
  .li .pid{font-weight:700;font-size:13px}
  .li .dots{display:flex;gap:4px;align-items:center}
  .li .t{font-size:12.5px;color:var(--subtle);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .detail{border:1px solid var(--border);border-radius:12px;background:#fff;padding:20px 22px;box-shadow:var(--shadow);min-height:78vh}
  .detail .dhead{display:flex;gap:10px;align-items:center;margin-bottom:8px}
  .fblock{padding:14px 0;border-bottom:1px dashed var(--border)} .fblock:last-child{border-bottom:0}
  .ftop{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .diff{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:4px}
  .old{background:rgba(224,85,85,.05);border-radius:10px;padding:10px 12px;white-space:pre-wrap;word-break:break-word}
  .new{background:rgba(46,158,91,.07);border-radius:10px;padding:10px 12px;white-space:pre-wrap;word-break:break-word}
  .evi{color:var(--muted);font-size:12px;font-style:italic;margin-top:6px}
  footer{color:var(--muted);font-size:12px;margin:28px 0 0;padding-top:14px;border-top:1px solid var(--border)}
</style>
```

Header (inline the brand icon — `viewBox` preserved so it scales):

```html
<header class="hero"><div class="row">
  <svg class="logo" viewBox="0 0 256.905 276.429" xmlns="http://www.w3.org/2000/svg">
    <path d="M105.268,9.012c14.434-8.261,32.219-8.261,46.653,0l77.363,44.27c14.437,8.261,23.328,23.527,23.328,40.047v88.543c0,16.522-8.891,31.788-23.328,40.047l-77.363,44.272c-14.434,8.259-32.219,8.259-46.653,0l-77.363-44.272c-14.437-8.259-23.328-23.525-23.328-40.047v-88.543c0-16.52,8.891-31.786,23.328-40.047L105.268,9.012Z" fill="#2f5bff"/>
    <path d="M128.835,212.982l58.734-34.381c3.786-2.216,6.107-6.278,6.093-10.665l-.205-68.157-58.501-33.341c-3.793-2.161-8.446-2.154-12.231.021l-59.191,33.999,65.074,37.056.226,75.468Z" fill="#fff"/>
  </svg>
  <div><h1>Feed Optimizer — <!-- action --> Review</h1>
  <p>Review only · nothing is applied · import the CSV yourself</p></div>
</div></header>
```

Body skeleton + the only JS needed (list selection). Build `records` server-side/in-Node from the
sample data — one per changed cell: `{pid, catalog, field, old, neu, list, conf, status, evidence}`
(`list` = the structured array for multi-value fields, else `null`; `status` ∈ `filled|abstained|rejected`).

```html
<div class="wrap">
  <div class="cards"><!-- stat cards: products, cells, written, abstained/rejected, write rate, model, seed --></div>
  <div class="split"><div class="list" id="list"></div><div class="detail" id="detail"></div></div>
  <footer>Source of truth: <b>sample-review.csv</b> — import that, not this page. Read-only review companion.</footer>
</div>
<script>
const RECORDS = /* injected: [{pid,catalog,field,old,neu,list,conf,status,evidence}, …] */;
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fl=f=>f.replace(/_/g,' ');
const groups=[...RECORDS.reduce((m,r)=>m.set(r.pid,[...(m.get(r.pid)||[]),r]),new Map())];
const newHtml=r=>r.list?'<ul class="vals">'+r.list.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':esc(r.neu);
const oldHtml=r=>r.old?esc(r.old):'<span class="empty">— empty —</span>';
const badges=r=>'<span class="badge '+r.status+'">'+r.status+'</span> <span class="conf">'+esc(r.conf)+'</span>';
let sel=groups[0][0];
const list=document.getElementById('list'),det=document.getElementById('detail');
function drawList(){
  list.innerHTML=groups.map(([pid,cells])=>{
    const title=cells.find(c=>c.field==='title')||cells[0];
    const dots=cells.map(c=>'<span class="stat-dot '+c.status+'" title="'+fl(c.field)+': '+c.status+'"></span>').join('');
    return '<div class="li'+(pid===sel?' sel':'')+'" data-pid="'+esc(pid)+'"><div class="pid">#'+esc(pid)+'</div><div class="dots">'+dots+'</div><div class="t">'+esc(title.neu||title.old)+'</div></div>';
  }).join('');
  list.querySelectorAll('.li').forEach(el=>el.onclick=()=>{sel=el.dataset.pid;drawList();drawDetail();});
}
function drawDetail(){
  const cells=groups.find(g=>g[0]===sel)[1];
  det.innerHTML='<div class="dhead"><h2 style="font-size:17px">#'+esc(sel)+'</h2><span class="chip">'+esc(cells[0].catalog)+'</span></div>'
    +cells.map(c=>'<div class="fblock"><div class="ftop"><span class="field-name">'+fl(c.field)+'</span>'+badges(c)+'</div>'
    +'<div class="diff"><div><div class="lbl">Old</div><div class="old">'+oldHtml(c)+'</div></div><div><div class="lbl">New</div><div class="new">'+newHtml(c)+'</div></div></div>'
    +(c.evidence?'<div class="evi">'+esc(c.evidence)+'</div>':'')+'</div>').join('');
}
drawList();drawDetail();
</script>
```

## Where to write it, and opening it

Write the file **next to the CSV it mirrors** in the job dir, same basename + `.html`:

- sample review → `created/feed-optimizer/jobs/<id>/sample-review.html`
- final diff → `created/feed-optimizer/jobs/<id>/output/diff.html`

Then **open it for the user** (macOS) and tell them you did:

```
open created/feed-optimizer/jobs/<id>/sample-review.html
```

(`open` is macOS; on Linux it would be `xdg-open`. This workspace is macOS — use `open`.) Mention the
path in your message too, in case the auto-open is blocked. The HTML is a convenience layer — if
building it ever fails, fall back to pointing the user at the CSV; never block the flow on it.
