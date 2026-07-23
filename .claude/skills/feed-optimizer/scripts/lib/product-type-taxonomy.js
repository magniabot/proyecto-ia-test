import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, '..', '..');
const TMP_DIR = resolve(SKILL_ROOT, 'tmp');

const UNIVERSAL_SKIP = new Set([
  'mm', 'cm', 'kg', 'gr', 'ml', 'my', 'µm', 'oz', 'lb', 'lbs', 'pcs',
  'liter', 'meter', 'inch', 'gram',
]);

function tokenize(title) {
  return title
    .toLowerCase()
    .replace(/[^a-zà-ÿáéíóöőúüűĀ-ſ0-9\s/-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^\d+$/.test(w) && !UNIVERSAL_SKIP.has(w));
}

function loadStopWords() {
  const path = resolve(TMP_DIR, 'stop-words.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function statisticalStopWords(products, language, threshold = 0.4) {
  const langProducts = products.filter(p => p.language === language);
  if (langProducts.length === 0) return new Set();
  const docFreq = new Map();
  for (const p of langProducts) {
    const seen = new Set();
    for (const t of tokenize(p.title)) {
      if (seen.has(t)) continue;
      seen.add(t);
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
  }
  const minCount = langProducts.length * threshold;
  const stops = new Set();
  for (const [term, count] of docFreq) {
    if (count >= minCount) stops.add(term);
  }
  return stops;
}

function getStopWordsForLanguage(products, language) {
  const loaded = loadStopWords();
  if (loaded && loaded[language]) return new Set(loaded[language]);
  return statisticalStopWords(products, language);
}

export function detectFeedLanguages(products) {
  const counts = new Map();
  for (const p of products) {
    const lang = (p.language || '').trim().toLowerCase();
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    languages: sorted.map(([lang, count]) => ({ language: lang, count, pct: Math.round(count / products.length * 100) })),
    primary: sorted.length > 0 ? sorted[0][0] : null,
    totalProducts: products.length,
  };
}

export function extractHighFrequencyTerms(products, language, topN = 100) {
  const langProducts = products.filter(p => (p.language || '').toLowerCase() === language);
  const docFreq = new Map();
  for (const p of langProducts) {
    const seen = new Set();
    for (const t of tokenize(p.title)) {
      if (seen.has(t)) continue;
      seen.add(t);
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
  }
  return [...docFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, count]) => ({
      term,
      count,
      pct: Math.round(count / langProducts.length * 100),
    }));
}

function buildClusterTokenProfile(products, stopWords) {
  const tokenCounts = new Map();
  for (const p of products) {
    for (const t of tokenize(p.title)) {
      if (stopWords.has(t)) continue;
      tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
    }
  }
  const threshold = Math.max(1, products.length * 0.1);
  const profile = new Map();
  for (const [token, count] of tokenCounts) {
    if (count >= threshold) profile.set(token, count / products.length);
  }
  return profile;
}

function findBestCluster(product, existingClusters, clusterProfiles, tf, stopWords) {
  const tokens = tokenize(product.title).filter(t => !stopWords.has(t));
  if (tokens.length === 0) return null;

  let bestCluster = null;
  let bestScore = 0;

  for (const [name, cluster] of existingClusters) {
    const profile = clusterProfiles.get(name);
    if (!profile) continue;
    let score = 0;
    let matchCount = 0;
    for (const t of tokens) {
      const weight = profile.get(t);
      if (weight !== undefined) {
        const idf = 1 / Math.log2(1 + (tf.get(t) || 1));
        score += idf * weight;
        matchCount++;
      }
    }
    if (matchCount === 0) continue;
    score = (score / tokens.length) * (matchCount / tokens.length);
    if (score > bestScore) {
      bestScore = score;
      bestCluster = name;
    }
  }

  return bestScore > 0.02 ? bestCluster : null;
}

export function clusterProducts(products, language) {
  const langProducts = products.filter(p => (p.language || '').toLowerCase() === language);
  const stopWords = getStopWordsForLanguage(products, language);

  const withType = langProducts.filter(p => p.product_type && p.product_type.trim());
  const withoutType = langProducts.filter(p => !p.product_type || !p.product_type.trim());

  // Term frequency for IDF scoring
  const tf = new Map();
  for (const p of langProducts) {
    const seen = new Set();
    for (const t of tokenize(p.title)) {
      if (stopWords.has(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      tf.set(t, (tf.get(t) || 0) + 1);
    }
  }

  // Cluster products with existing product_type by top-level category
  const existingClusters = new Map();
  for (const p of withType) {
    const pt = p.product_type.trim();
    const topLevel = pt.split(' > ')[0];
    if (!existingClusters.has(topLevel)) {
      existingClusters.set(topLevel, { name: topLevel, fullPaths: new Map(), products: [] });
    }
    const cluster = existingClusters.get(topLevel);
    cluster.products.push(p);
    cluster.fullPaths.set(pt, (cluster.fullPaths.get(pt) || 0) + 1);
  }

  // Build token profiles for existing clusters
  const clusterProfiles = new Map();
  for (const [name, cluster] of existingClusters) {
    clusterProfiles.set(name, buildClusterTokenProfile(cluster.products, stopWords));
  }

  // Try to assign blank products to existing clusters
  const assigned = new Map();
  const unassigned = [];
  for (const p of withoutType) {
    const match = findBestCluster(p, existingClusters, clusterProfiles, tf, stopWords);
    if (match) {
      if (!assigned.has(match)) assigned.set(match, []);
      assigned.get(match).push(p);
    } else {
      unassigned.push(p);
    }
  }

  // Keyword-cluster the remaining unassigned products
  const keywordClusters = new Map();
  for (const p of unassigned) {
    const tokens = tokenize(p.title).filter(t => !stopWords.has(t));
    const scored = tokens
      .map(t => [t, tf.get(t) || 0])
      .filter(([, s]) => s >= 2 && s <= langProducts.length * 0.5)
      .sort((a, b) => b[1] - a[1]);

    const key = scored.length > 0 ? scored[0][0] : '(uncategorized)';
    if (!keywordClusters.has(key)) keywordClusters.set(key, []);
    keywordClusters.get(key).push(p);
  }

  // Merge tiny keyword clusters into uncategorized
  const uncategorized = keywordClusters.get('(uncategorized)') || [];
  for (const [key, prods] of keywordClusters) {
    if (key !== '(uncategorized)' && prods.length <= 2) {
      uncategorized.push(...prods);
      keywordClusters.delete(key);
    }
  }
  if (uncategorized.length > 0) keywordClusters.set('(uncategorized)', uncategorized);

  // Build final cluster list
  const clusters = [];

  for (const [name, cluster] of existingClusters) {
    const assignedBlank = assigned.get(name) || [];
    const topPaths = [...cluster.fullPaths.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    clusters.push({
      id: clusters.length,
      name,
      source: 'existing_taxonomy',
      typedCount: cluster.products.length,
      blankCount: assignedBlank.length,
      totalCount: cluster.products.length + assignedBlank.length,
      topPaths: topPaths.map(([path, count]) => ({ path, count, depth: path.split(' > ').length })),
      sampleTyped: cluster.products.slice(0, 5).map(p => ({ product_id: p.product_id, title: p.title, product_type: p.product_type })),
      sampleBlank: assignedBlank.slice(0, 5).map(p => ({ product_id: p.product_id, title: p.title })),
      typedProductIds: cluster.products.map(p => p.product_id),
      blankProductIds: assignedBlank.map(p => p.product_id),
    });
  }

  for (const [keyword, prods] of keywordClusters) {
    clusters.push({
      id: clusters.length,
      name: keyword === '(uncategorized)' ? '(uncategorized)' : keyword,
      source: 'keyword_cluster',
      typedCount: 0,
      blankCount: prods.length,
      totalCount: prods.length,
      topPaths: [],
      sampleTyped: [],
      sampleBlank: prods.slice(0, 5).map(p => ({ product_id: p.product_id, title: p.title })),
      typedProductIds: [],
      blankProductIds: prods.map(p => p.product_id),
    });
  }

  clusters.sort((a, b) => b.totalCount - a.totalCount);
  clusters.forEach((c, i) => c.id = i);

  return {
    language,
    totalProducts: langProducts.length,
    typedProducts: withType.length,
    blankProducts: withoutType.length,
    clusterCount: clusters.length,
    clusters,
    stopWordsSource: loadStopWords()?.[language] ? 'claude-generated' : 'statistical-fallback',
  };
}

export function validateProductTypePath(path) {
  const errors = [];
  const warnings = [];
  if (!path || !path.trim()) return { valid: false, errors: ['Path is empty'], warnings, levels: 0 };

  const levels = path.split(' > ');
  if (levels.length > 5) errors.push(`${levels.length} levels exceeds max of 5`);
  if (levels.length > 3) warnings.push(`${levels.length} levels — ensure depth 4+ is justified by segmentation need`);
  if (path.length > 750) errors.push(`${path.length} chars exceeds 750 limit`);
  if (path.includes('>>') || />\s*>/.test(path)) errors.push('Malformed separator');
  for (const level of levels) {
    const trimmed = level.trim();
    if (!trimmed) errors.push('Empty level in path');
    if (trimmed !== level) warnings.push(`Extra whitespace around "${trimmed}"`);
  }

  return { valid: errors.length === 0, errors, warnings, levels: levels.length };
}

