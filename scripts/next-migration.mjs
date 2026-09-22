#!/usr/bin/env node
// Vertelt je het eerstvolgende vrije migratienummer.
// Gebruik: node scripts/next-migration.mjs
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(root).filter((f) => /^migration_v\d+_.*\.sql$/.test(f));

const entries = files.map((f) => {
  const m = f.match(/^migration_v(\d+)_/);
  return { file: f, num: parseInt(m[1], 10) };
});

const byNum = new Map();
for (const { file, num } of entries) {
  if (!byNum.has(num)) byNum.set(num, []);
  byNum.get(num).push(file);
}

const dupes = [...byNum.entries()].filter(([, fs]) => fs.length > 1);
const max = entries.length ? Math.max(...entries.map((e) => e.num)) : 0;
const next = max + 1;

console.log(`Hoogste bestaande migratienummer: v${max}`);
console.log(`Volgende vrije nummer: v${next}`);
console.log(`Bestandsnaam: migration_v${next}_<korte_naam>.sql`);

if (dupes.length) {
  console.log('\nLet op: deze nummers bestaan dubbel (oud, laat met rust, niet hergebruiken of aanvullen):');
  for (const [num, fs] of dupes.sort((a, b) => a[0] - b[0])) {
    console.log(`  v${num}: ${fs.join(', ')}`);
  }
}
