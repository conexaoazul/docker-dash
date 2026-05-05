#!/usr/bin/env node
'use strict';

// Post-v8.2.x audit closure: extract all built-in How-To guides from the SQLite
// database (whose content originated in migrations 040, 041, 042, 048, 050,
// 052, 053, 055, 058-062) into individual `.md` files under
// `src/db/howto-content/`.
//
// After this runs, future edits to a how-to are a one-line PR against the
// markdown file — not a new migration. The startup loader (shipped in v8.2.x)
// UPSERTs them on next boot, so existing installs pick up edits automatically.
//
// Usage: node scripts/extract-howtos-to-markdown.js [--db /path/to/docker-dash.db]
//
// Default DB path tries:
//   1. process.env.DB_PATH
//   2. /data/docker-dash.db (production)
//   3. ./data/docker-dash.db (dev)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const argDb = process.argv.find(a => a.startsWith('--db='))?.split('=')[1];
const candidates = [
  argDb,
  process.env.DB_PATH,
  '/data/docker-dash.db',
  path.join(__dirname, '..', 'data', 'docker-dash.db'),
].filter(Boolean);

const dbPath = candidates.find(p => fs.existsSync(p));
if (!dbPath) {
  console.error('No docker-dash.db found. Tried:');
  candidates.forEach(p => console.error('  ' + p));
  console.error('\nPass --db=/path/to/docker-dash.db explicitly.');
  process.exit(1);
}

console.log(`📚 Extracting howtos from: ${dbPath}`);
const outDir = path.join(__dirname, '..', 'src', 'db', 'howto-content');
fs.mkdirSync(outDir, { recursive: true });

const db = new Database(dbPath, { readonly: true });

const rows = db.prepare(`
  SELECT slug, title, title_ro, category, difficulty, icon,
         summary, summary_ro, content, content_ro
  FROM howto_guides
  WHERE is_builtin = 1
  ORDER BY slug
`).all();

console.log(`   Found ${rows.length} built-in howtos.\n`);

function _escapeYaml(s) {
  if (s == null) return '';
  // Strings with : or # need quoting in YAML; wrap in single quotes if so
  if (/[:#"'\n]/.test(s)) {
    return "'" + s.replace(/'/g, "''") + "'";
  }
  return s;
}

let written = 0;
let skipped = 0;
const skippedSlugs = [];

for (const r of rows) {
  if (!r.slug || !r.title) {
    skipped++;
    continue;
  }
  // Skip if BOTH content fields are empty — nothing to extract for those (they're
  // metadata-only entries from migration 038's seed list).
  if (!r.content && !r.content_ro) {
    skipped++;
    skippedSlugs.push(r.slug + ' (no body)');
    continue;
  }

  // EN file
  if (r.content) {
    const enPath = path.join(outDir, `${r.slug}.md`);
    if (!fs.existsSync(enPath)) {
      const fm = [
        '---',
        `title: ${_escapeYaml(r.title)}`,
        `summary: ${_escapeYaml(r.summary || '')}`,
        `category: ${_escapeYaml(r.category || 'general')}`,
        `difficulty: ${_escapeYaml(r.difficulty || 'beginner')}`,
        `icon: ${_escapeYaml(r.icon || 'fas fa-book')}`,
        '---',
        '',
        r.content,
        '',
      ].join('\n');
      fs.writeFileSync(enPath, fm, 'utf8');
      written++;
    }
  }

  // RO file (only if RO content exists)
  if (r.content_ro && r.content_ro.trim()) {
    const roPath = path.join(outDir, `${r.slug}.ro.md`);
    if (!fs.existsSync(roPath)) {
      const fm = [
        '---',
        `title: ${_escapeYaml(r.title_ro || r.title)}`,
        `summary: ${_escapeYaml(r.summary_ro || r.summary || '')}`,
        '---',
        '',
        r.content_ro,
        '',
      ].join('\n');
      fs.writeFileSync(roPath, fm, 'utf8');
      written++;
    }
  }
}

console.log(`✅ Wrote ${written} markdown files to ${outDir}`);
console.log(`   Skipped ${skipped} (metadata-only entries from migration 038's seed list).`);
if (skippedSlugs.length > 0 && skippedSlugs.length <= 30) {
  console.log('   Skipped slugs:');
  skippedSlugs.forEach(s => console.log('     - ' + s));
}
console.log('\nNext: drop these files into a PR. The startup loader will UPSERT them on boot.');
