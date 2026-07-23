// Optional brand-voice discovery for the content action. Reads context/brand.md and
// context/business.md when present and extracts a bounded voice/tone hint to seed the prompt.
// NEVER required — absent files yield an empty hint and the neutral, factual catalog voice is used.
// Voice influences phrasing only; it never introduces facts and never overrides the Guidelines'
// prohibited-content rules.

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const MAX_HINT_CHARS = 600;
// Headings that typically carry voice/tone guidance in a brand brief.
const VOICE_HEADING_RE = /^#{1,4}\s*(.*(brand voice|tone of voice|voice|tone|messaging|style|personality).*)$/i;

function extractVoiceSection(md) {
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (VOICE_HEADING_RE.test(lines[i].trim())) {
      const body = [];
      for (let j = i + 1; j < lines.length && body.join('\n').length < MAX_HINT_CHARS; j++) {
        if (/^#{1,4}\s/.test(lines[j])) break; // next heading ends the section
        if (lines[j].trim()) body.push(lines[j].trim());
      }
      if (body.length) return body.join(' ').slice(0, MAX_HINT_CHARS);
    }
  }
  return '';
}

function readMd(projectRoot, rel) {
  const path = resolve(projectRoot, rel);
  if (!existsSync(path)) return '';
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

// Returns { hint, sources } — hint is a short voice string for the prompt (may be ''), sources lists
// which files contributed.
export function discoverVoice(projectRoot) {
  const sources = [];
  const parts = [];
  for (const rel of ['context/brand.md', 'context/business.md']) {
    const md = readMd(projectRoot, rel);
    if (!md) continue;
    const section = extractVoiceSection(md);
    if (section) { parts.push(section); sources.push(rel); }
  }
  const hint = parts.join(' ').slice(0, MAX_HINT_CHARS).trim();
  return { hint, sources };
}
