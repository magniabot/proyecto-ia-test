import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, '..', '..');
const TMP_DIR = resolve(SKILL_ROOT, 'tmp');

const TAXONOMY_URL = 'https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt';
// Locale-consistent cache filename (matches feed-auditor's per-locale scheme: google-taxonomy-{locale}.txt).
const TAXONOMY_CACHE_FILE = 'google-taxonomy-en-US.txt';
const MAX_AGE_DAYS = 30;

function taxonomyCachePath() {
  return resolve(TMP_DIR, TAXONOMY_CACHE_FILE);
}

function isCacheStale(filePath, maxAgeDays) {
  if (!existsSync(filePath)) return true;
  const ageMs = Date.now() - statSync(filePath).mtimeMs;
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

export async function fetchAndCacheTaxonomy({ force = false } = {}) {
  const cachePath = taxonomyCachePath();
  const stale = isCacheStale(cachePath, MAX_AGE_DAYS);

  if (!force && !stale) {
    const raw = readFileSync(cachePath, 'utf8');
    const lineCount = raw.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
    return {
      status: 'cached',
      path: cachePath,
      categories: lineCount,
      age_days: Math.round((Date.now() - statSync(cachePath).mtimeMs) / (24 * 60 * 60 * 1000)),
      max_age_days: MAX_AGE_DAYS,
    };
  }

  const response = await fetch(TAXONOMY_URL);
  if (!response.ok) {
    if (existsSync(cachePath)) {
      const raw = readFileSync(cachePath, 'utf8');
      const lineCount = raw.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
      return {
        status: 'fetch_failed_using_stale_cache',
        path: cachePath,
        categories: lineCount,
        error: `HTTP ${response.status}`,
      };
    }
    throw new Error(`Failed to fetch taxonomy: HTTP ${response.status} and no cached version exists.`);
  }

  const text = await response.text();
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(cachePath, text, 'utf8');
  const lineCount = text.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;

  return {
    status: force ? 'force_refreshed' : (stale ? 'refreshed' : 'fetched'),
    path: cachePath,
    categories: lineCount,
    age_days: 0,
    max_age_days: MAX_AGE_DAYS,
  };
}

export function parseTaxonomy(filePath) {
  const raw = readFileSync(filePath || taxonomyCachePath(), 'utf8');
  const idToPath = new Map();
  const pathToId = new Map();
  const keywords = new Map();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const dashIdx = trimmed.indexOf(' - ');
    if (dashIdx === -1) continue;

    const id = trimmed.slice(0, dashIdx).trim();
    const path = trimmed.slice(dashIdx + 3).trim();

    idToPath.set(id, path);
    pathToId.set(path.toLowerCase(), { id, path });

    const segments = path.split(' > ');
    for (const segment of segments) {
      const tokens = segment.toLowerCase().split(/[\s&,]+/).filter(t => t.length > 1);
      for (const token of tokens) {
        if (!keywords.has(token)) keywords.set(token, []);
        keywords.get(token).push({ id, path, depth: segments.length });
      }
    }
  }

  return { idToPath, pathToId, keywords, totalCategories: idToPath.size };
}

export function resolveGpcPath(taxonomyData, gpcId) {
  const id = String(gpcId).trim();
  return taxonomyData.idToPath.get(id) || null;
}

export function searchTaxonomy(taxonomyData, queryKeywords, topN = 10) {
  const tokens = queryKeywords
    .toLowerCase()
    .split(/[\s,;|&>]+/)
    .map(t => t.trim())
    .filter(t => t.length > 1);

  if (tokens.length === 0) return [];

  const scores = new Map();

  for (const token of tokens) {
    const matches = taxonomyData.keywords.get(token) || [];
    for (const match of matches) {
      const current = scores.get(match.id) || { id: match.id, path: match.path, depth: match.depth, score: 0, matchedTokens: new Set() };
      current.score += 1;
      current.matchedTokens.add(token);
      scores.set(match.id, current);
    }
  }

  // Boost scores: more matched tokens = better; deeper = more specific = better
  for (const entry of scores.values()) {
    const tokenCoverage = entry.matchedTokens.size / tokens.length;
    const depthBonus = Math.min(entry.depth / 5, 1) * 0.3;
    entry.finalScore = (entry.score * tokenCoverage) + depthBonus;
  }

  return [...scores.values()]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topN)
    .map(e => ({
      id: e.id,
      path: e.path,
      depth: e.depth,
      matched_tokens: [...e.matchedTokens],
      score: Math.round(e.finalScore * 100) / 100,
    }));
}

function tokenize(title) {
  return title
    .toLowerCase()
    .replace(/[^a-zà-ÿáéíóöőúüűĀ-ſ0-9\s/-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^\d+$/.test(w));
}

// The product's CURRENT canonical GPC id. Prefer gpc_id (normalized at pull time by feed-auditor —
// works for any feed language); fall back to the raw value only when it is already numeric; else
// treat as "no current category". This keeps clustering correct on non-English feeds and stays
// compatible with caches written before GPC normalization existed.
export function currentGpcOf(product) {
  const id = String(product.gpc_id || '').trim();
  if (id) return id;
  const raw = String(product.google_product_category || '').trim();
  return /^\d+$/.test(raw) ? raw : '';
}

export function clusterForTaxonomy(products, taxonomyData) {
  const clusters = new Map();
  const noProductType = [];

  // Primary signal: group by product_type top-level
  for (const p of products) {
    const pt = (p.product_type || '').trim();
    if (pt) {
      const topLevel = pt.split(' > ')[0].trim();
      if (!clusters.has(topLevel)) {
        clusters.set(topLevel, {
          name: topLevel,
          source: 'product_type',
          fullProductTypes: new Map(),
          products: [],
        });
      }
      const cluster = clusters.get(topLevel);
      cluster.products.push(p);
      cluster.fullProductTypes.set(pt, (cluster.fullProductTypes.get(pt) || 0) + 1);
    } else {
      noProductType.push(p);
    }
  }

  // Secondary signal: group remaining by current GPC
  const noGpc = [];
  const gpcGroups = new Map();
  for (const p of noProductType) {
    const gpc = currentGpcOf(p);
    if (gpc) {
      if (!gpcGroups.has(gpc)) gpcGroups.set(gpc, []);
      gpcGroups.get(gpc).push(p);
    } else {
      noGpc.push(p);
    }
  }

  for (const [gpcId, prods] of gpcGroups) {
    const gpcPath = resolveGpcPath(taxonomyData, gpcId) || `GPC ${gpcId}`;
    const name = `(current GPC) ${gpcPath}`;
    clusters.set(name, {
      name,
      source: 'current_gpc',
      currentGpcId: gpcId,
      currentGpcPath: gpcPath,
      fullProductTypes: new Map(),
      products: prods,
    });
  }

  // Tertiary signal: title keywords for products with no product_type and no GPC
  const keywordGroups = new Map();
  for (const p of noGpc) {
    const tokens = tokenize(p.title || '');
    const key = tokens.length > 0 ? tokens[0] : '(unknown)';
    if (!keywordGroups.has(key)) keywordGroups.set(key, []);
    keywordGroups.get(key).push(p);
  }

  const uncategorized = [];
  for (const [key, prods] of keywordGroups) {
    if (key === '(unknown)' || prods.length <= 2) {
      uncategorized.push(...prods);
    } else {
      clusters.set(`(keyword) ${key}`, {
        name: `(keyword) ${key}`,
        source: 'title_keyword',
        fullProductTypes: new Map(),
        products: prods,
      });
    }
  }
  if (uncategorized.length > 0) {
    clusters.set('(uncategorized)', {
      name: '(uncategorized)',
      source: 'uncategorized',
      fullProductTypes: new Map(),
      products: uncategorized,
    });
  }

  // Build output
  const result = [];
  let idx = 0;
  for (const [, cluster] of clusters) {
    if (cluster.products.length === 0) continue;

    const currentGpcIds = new Map();
    for (const p of cluster.products) {
      const gpc = currentGpcOf(p);
      if (gpc) currentGpcIds.set(gpc, (currentGpcIds.get(gpc) || 0) + 1);
    }

    const gpcDistribution = [...currentGpcIds.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({
        id,
        path: resolveGpcPath(taxonomyData, id) || `(unknown ID ${id})`,
        count,
      }));

    const topProductTypes = [...(cluster.fullProductTypes || new Map()).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    result.push({
      id: idx++,
      name: cluster.name,
      source: cluster.source,
      productCount: cluster.products.length,
      currentGpcDistribution: gpcDistribution,
      topProductTypes,
      sampleProducts: cluster.products.slice(0, 5).map(p => ({
        product_id: p.product_id,
        title: p.title,
        product_type: p.product_type || '',
        google_product_category: p.google_product_category || '',
      })),
      productIds: cluster.products.map(p => p.product_id),
    });
  }

  result.sort((a, b) => b.productCount - a.productCount);
  result.forEach((c, i) => c.id = i);

  // Summary stats
  const uniqueGpcIds = new Set(products.map(p => currentGpcOf(p)).filter(Boolean));
  const withProductType = products.filter(p => (p.product_type || '').trim()).length;

  return {
    totalProducts: products.length,
    withProductType,
    withoutProductType: products.length - withProductType,
    uniqueCurrentGpcValues: uniqueGpcIds.size,
    clusterCount: result.length,
    clusters: result,
  };
}

export function gpcDistributionSummary(products, taxonomyData) {
  const counts = new Map();
  for (const p of products) {
    const gpc = currentGpcOf(p) || '(blank)';
    counts.set(gpc, (counts.get(gpc) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id,
      path: id === '(blank)' ? '(blank)' : (resolveGpcPath(taxonomyData, id) || `(unknown ID ${id})`),
      count,
      pct: Math.round(count / products.length * 100),
    }));
}
