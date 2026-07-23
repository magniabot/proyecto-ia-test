// Google product-taxonomy fetch + decode + multi-language GPC normalization. Self-contained
// inside feed-auditor.
//
// Copied (not imported) from feed-optimizer so the auditor stays runnable even when the
// optimizer is not installed — same independence principle as bundling the auditor's own GAQL.
// NOTE: the two copies have intentionally diverged. The localized GPC *normalization* (this file)
// lives ONLY here, on the pull side: pull-data enriches every product with a canonical numeric
// `gpc_id` + English path, and feed-optimizer simply consumes those from the shared merchant cache.
// If you change the shared parse/fetch primitives in BOTH skills, keep them in sync deliberately.
//
// Purpose here:
//   1. Normalize each product's google_product_category to a canonical numeric id, regardless of
//      whether the merchant supplied an id, an "id - path" string, or a localized text path in any
//      Google-supported feed language (e.g. German "Tiere & Haustierbedarf > ...").
//   2. Resolve that id to its English path ("Animals & Pet Supplies > ...") so completeness can
//      derive the top-level vertical from the SAME English node set across every feed language.
//
// The numeric ids are language-independent: every taxonomy-with-ids.{locale}.txt file uses the same
// ids, only the path text is translated. So a localized path -> id reverse-lookup yields the
// language-neutral id, which we then map back to the English path.

import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, '..', '..');
const TMP_DIR = resolve(SKILL_ROOT, 'tmp');

const TAXONOMY_URL_TEMPLATE = 'https://www.google.com/basepages/producttype/taxonomy-with-ids.{locale}.txt';
const DEFAULT_LOCALE = 'en-US';
const MAX_AGE_DAYS = 30;

// The full set of locales Google actually publishes a taxonomy-with-ids file for. Verified live by
// probing the endpoint (HEAD/GET -> 200). Re-verify when Google adds languages:
//   for loc in <candidate>; do curl -s -o /dev/null -w "%{http_code}\n" \
//     "https://www.google.com/basepages/producttype/taxonomy-with-ids.$loc.txt"; done
export const SUPPORTED_TAXONOMY_LOCALES = new Set([
  'en-US', 'en-GB', 'en-AU',
  'de-DE', 'de-CH',
  'fr-FR', 'fr-CH',
  'nl-NL', 'it-IT', 'es-ES', 'cs-CZ', 'da-DK', 'no-NO', 'sv-SE', 'pl-PL',
  'pt-BR', 'ru-RU', 'tr-TR', 'ja-JP', 'zh-CN', 'ar-SA', 'fi-FI', 'el-GR',
  'hu-HU', 'ro-RO', 'sk-SK',
]);

// Bare ISO-639 language code -> the canonical Google locale we fetch for it. Used when content_language
// has no region (e.g. "de") or carries a region Google does not publish (e.g. "de-AT" -> de-DE,
// "pt-PT" -> pt-BR, "es-MX" -> es-ES, "zh-TW" -> zh-CN). A language absent from this map has no Google
// taxonomy at all -> localized GPC paths in it cannot be normalized (informational, never fatal).
const LANGUAGE_TO_LOCALE = {
  en: 'en-US', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', it: 'it-IT', es: 'es-ES',
  cs: 'cs-CZ', da: 'da-DK', no: 'no-NO', nb: 'no-NO', nn: 'no-NO', sv: 'sv-SE',
  pl: 'pl-PL', pt: 'pt-BR', ru: 'ru-RU', tr: 'tr-TR', ja: 'ja-JP', zh: 'zh-CN',
  ar: 'ar-SA', fi: 'fi-FI', el: 'el-GR', hu: 'hu-HU', ro: 'ro-RO', sk: 'sk-SK',
};

const ID_PREFIX_RE = /^(\d+)\s*[-–—]\s*\S/; // "4989 - Animals & Pet Supplies > ..."

// content_language ("nl", "en-GB", "pt_BR") -> a supported Google locale, or null when Google ships
// no taxonomy for that language. Exact supported regional variants win; otherwise fall back to the
// bare-language preferred locale.
export function mapLanguageToLocale(contentLanguage) {
  const norm = String(contentLanguage || '').trim().replace(/_/g, '-');
  if (!norm) return null;
  const [langPart, regionPart] = norm.split('-');
  const lang = langPart.toLowerCase();
  if (regionPart) {
    const full = `${lang}-${regionPart.toUpperCase()}`;
    if (SUPPORTED_TAXONOMY_LOCALES.has(full)) return full;
  }
  return LANGUAGE_TO_LOCALE[lang] || null;
}

function localeUrl(locale) {
  return TAXONOMY_URL_TEMPLATE.replace('{locale}', locale);
}

function localeCacheFile(locale) {
  return `google-taxonomy-${locale}.txt`;
}

export function localeCachePath(locale) {
  return resolve(TMP_DIR, localeCacheFile(locale));
}

// Backward-compatible default-locale cache path. parseTaxonomy() with no argument reads this, so the
// completeness module (which loads the English taxonomy offline) keeps working unchanged.
export function taxonomyCachePath() {
  return localeCachePath(DEFAULT_LOCALE);
}

function isCacheStale(filePath, maxAgeDays) {
  if (!existsSync(filePath)) return true;
  const ageMs = Date.now() - statSync(filePath).mtimeMs;
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

function countCategories(text) {
  return text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length;
}

// Network call — only used during the pull-data phase. analyze/completeness read the cache offline
// via parseTaxonomy(). Falls back to a stale cache when the fetch fails. One locale per call.
export async function fetchAndCacheTaxonomy({ locale = DEFAULT_LOCALE, force = false } = {}) {
  const cachePath = localeCachePath(locale);
  const stale = isCacheStale(cachePath, MAX_AGE_DAYS);

  if (!force && !stale) {
    const raw = readFileSync(cachePath, 'utf8');
    return {
      status: 'cached',
      locale,
      path: cachePath,
      categories: countCategories(raw),
      age_days: Math.round((Date.now() - statSync(cachePath).mtimeMs) / (24 * 60 * 60 * 1000)),
      max_age_days: MAX_AGE_DAYS,
    };
  }

  try {
    const response = await fetch(localeUrl(locale));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    writeFileSync(cachePath, text, 'utf8');
    return {
      status: force ? 'force_refreshed' : (stale ? 'refreshed' : 'fetched'),
      locale,
      path: cachePath,
      categories: countCategories(text),
      age_days: 0,
      max_age_days: MAX_AGE_DAYS,
    };
  } catch (error) {
    if (existsSync(cachePath)) {
      const raw = readFileSync(cachePath, 'utf8');
      return {
        status: 'fetch_failed_using_stale_cache',
        locale,
        path: cachePath,
        categories: countCategories(raw),
        error: String(error.message || error),
      };
    }
    return { status: 'fetch_failed_no_cache', locale, path: cachePath, categories: 0, error: String(error.message || error) };
  }
}

// Fetch English (always needed for the vertical's English path) plus one file per distinct feed
// language that Google supports. Languages Google does not publish are returned separately so the
// caller can record them as informational (their localized GPC paths simply stay unresolved).
export async function fetchTaxonomiesForLanguages(contentLanguages = [], { force = false } = {}) {
  const locales = new Set([DEFAULT_LOCALE]);
  const unsupportedLanguages = [];
  for (const lang of contentLanguages) {
    if (!lang) continue;
    const locale = mapLanguageToLocale(lang);
    if (locale) locales.add(locale);
    else unsupportedLanguages.push(lang);
  }

  const results = [];
  const localesFetched = [];
  for (const locale of locales) {
    const result = await fetchAndCacheTaxonomy({ locale, force });
    results.push(result);
    if (existsSync(localeCachePath(locale))) localesFetched.push(locale);
  }

  return {
    results,
    localesFetched,
    unsupportedLanguages: [...new Set(unsupportedLanguages)],
  };
}

// Collapse separators/whitespace/case so a merchant path and a taxonomy line compare equal.
// Matches on the FULL path (never a bare leaf — a leaf like "Bird Cages & Stands" can live under
// multiple parents, so leaf-only matching would invent false ids).
export function canonicalizePath(value) {
  return String(value || '')
    .replace(/[›»]/g, '>')
    .split('>')
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' > ')
    .toLowerCase();
}

// Parse a taxonomy-with-ids file into both directions: id->path (forward) and canonical-path->id
// (reverse, for localized normalization).
export function parseTaxonomy(filePath) {
  const path = filePath || taxonomyCachePath();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const idToPath = new Map();
  const pathToId = new Map();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const dashIdx = trimmed.indexOf(' - ');
    if (dashIdx === -1) continue;
    const id = trimmed.slice(0, dashIdx).trim();
    const categoryPath = trimmed.slice(dashIdx + 3).trim();
    idToPath.set(id, categoryPath);
    pathToId.set(canonicalizePath(categoryPath), { id, path: categoryPath });
  }

  return { idToPath, pathToId, totalCategories: idToPath.size };
}

// Load parsed taxonomies for a set of locales (offline, from the bundled caches). Returns a lookup
// bundle for normalizeGpc: per-locale parsed data plus a direct handle on English.
export function loadTaxonomies(locales = [DEFAULT_LOCALE]) {
  const byLocale = new Map();
  for (const locale of new Set([DEFAULT_LOCALE, ...locales])) {
    const parsed = parseTaxonomy(localeCachePath(locale));
    if (parsed) byLocale.set(locale, parsed);
  }
  return { byLocale, en: byLocale.get(DEFAULT_LOCALE) || null, localesLoaded: [...byLocale.keys()] };
}

// Normalize a single google_product_category value to a canonical numeric id + English path.
// 3-tier resolution ladder (tiers 1-2 are language-independent; only tier 3 needs the feed language):
//   1. pure numeric id            -> numeric-valid | numeric-invalid
//   2. "<id> - <path>" prefix     -> id-prefixed   | numeric-invalid
//   3. text path                  -> reverse-lookup in the product's language, then English:
//        localized-path | english-path | unresolved-no-match | unresolved-unsupported-language
//   empty value                   -> empty
// gpc_id is left blank on every unresolved/invalid outcome; the raw value is preserved by the caller.
export function normalizeGpc({ rawValue, contentLanguage, taxonomies }) {
  const en = taxonomies?.en || null;
  const byLocale = taxonomies?.byLocale || new Map();
  const raw = String(rawValue || '').trim();
  if (!raw) return { gpc_id: '', gpc_path_en: '', gpc_resolution_source: 'empty' };

  // Tier 1 — pure numeric id.
  if (/^\d+$/.test(raw)) {
    const path = en && en.idToPath.get(raw);
    if (path) return { gpc_id: raw, gpc_path_en: path, gpc_resolution_source: 'numeric-valid' };
    return { gpc_id: '', gpc_path_en: '', gpc_resolution_source: 'numeric-invalid' };
  }

  // Tier 2 — leading id prefix, e.g. "4989 - Animals & Pet Supplies > ...".
  const prefix = raw.match(ID_PREFIX_RE);
  if (prefix) {
    const id = prefix[1];
    const path = en && en.idToPath.get(id);
    if (path) return { gpc_id: id, gpc_path_en: path, gpc_resolution_source: 'id-prefixed' };
    return { gpc_id: '', gpc_path_en: '', gpc_resolution_source: 'numeric-invalid' };
  }

  // Tier 3 — text path. Reverse-lookup against the product's own language first, then English.
  const key = canonicalizePath(raw);
  const locale = mapLanguageToLocale(contentLanguage);

  if (locale && byLocale.has(locale)) {
    const hit = byLocale.get(locale).pathToId.get(key);
    if (hit) {
      const enPath = (en && en.idToPath.get(hit.id)) || hit.path;
      const source = locale.startsWith('en') ? 'english-path' : 'localized-path';
      return { gpc_id: hit.id, gpc_path_en: enPath, gpc_resolution_source: source };
    }
  }
  // English fallback — covers values supplied in English regardless of the feed's declared language.
  if (en) {
    const hit = en.pathToId.get(key);
    if (hit) {
      return { gpc_id: hit.id, gpc_path_en: en.idToPath.get(hit.id) || hit.path, gpc_resolution_source: 'english-path' };
    }
  }

  if (!locale) return { gpc_id: '', gpc_path_en: '', gpc_resolution_source: 'unresolved-unsupported-language' };
  return { gpc_id: '', gpc_path_en: '', gpc_resolution_source: 'unresolved-no-match' };
}

// Enrich products IN PLACE with gpc_id / gpc_path_en / gpc_resolution_source, and return a stats
// block for the pull summary. The raw google_product_category is left untouched (full audit trail).
export function enrichProductsWithGpc(products, taxonomies, unsupportedLanguages = []) {
  const bySource = {};
  let resolved = 0;
  for (const product of products) {
    const result = normalizeGpc({
      rawValue: product.google_product_category,
      contentLanguage: product.language,
      taxonomies,
    });
    product.gpc_id = result.gpc_id;
    product.gpc_path_en = result.gpc_path_en;
    product.gpc_resolution_source = result.gpc_resolution_source;
    bySource[result.gpc_resolution_source] = (bySource[result.gpc_resolution_source] || 0) + 1;
    if (result.gpc_id) resolved += 1;
  }
  return {
    total: products.length,
    resolved_to_id: resolved,
    by_source: bySource,
    locales_used: taxonomies?.localesLoaded || [],
    unsupported_languages: [...new Set(unsupportedLanguages)],
  };
}

// A google_product_category value can be a numeric id ("974") or a full ">"-path. Resolve to a full
// path when possible; return the original when it is already a path or cannot be resolved. Kept for
// completeness's fallback path (the primary signal is now the pre-normalized product.gpc_path_en).
export function resolveGpcPath(taxonomyData, gpcValue) {
  const value = String(gpcValue || '').trim();
  if (!value) return '';
  if (value.includes('>')) return value; // already a path
  if (/^\d+$/.test(value) && taxonomyData) {
    return taxonomyData.idToPath.get(value) || '';
  }
  return value;
}

// The first node of a path is the "vertical" anchor (Google's own top-level taxonomy node).
export function topLevelOf(path) {
  const p = String(path || '').trim();
  if (!p) return '';
  return p.split('>')[0].trim();
}

// Resolve a single product to a vertical. Signal chain:
//   1. gpc_path_en (pre-normalized at pull time — works for ANY feed language) -> top-level node
//      Fallback: resolve the raw google_product_category live (numeric id or path).
//   2. product_type top-level node (merchant breadcrumb; may be foreign-language)
//   3. '' (unclassified -> caller applies the base-only safety default)
// Returns { vertical, source } so callers can report classification confidence.
export function classifyVertical(product, taxonomyData) {
  let gpcPath = String(product.gpc_path_en || '').trim();
  if (!gpcPath) gpcPath = resolveGpcPath(taxonomyData, product.google_product_category);
  const gpcTop = topLevelOf(gpcPath);
  if (gpcTop) return { vertical: gpcTop, source: 'gpc' };

  const ptTop = topLevelOf(String(product.product_type || '').split('|')[0]);
  if (ptTop) return { vertical: ptTop, source: 'product_type' };

  return { vertical: '', source: 'unclassified' };
}
