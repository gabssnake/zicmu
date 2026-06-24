#!/usr/bin/env node
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(__dirname, '..', 'media');

// Parse "Artist - Title (Year).mp3"
function parseFilename(filename) {
  const name = basename(filename, '.mp3');

  // Split on first " - "
  const dashIdx = name.indexOf(' - ');
  if (dashIdx === -1) return null;

  const artist = name.slice(0, dashIdx).replaceAll('_', '').trim();
  let rest = name.slice(dashIdx + 3).trim();

  // Extract year from parentheses
  const yearMatch = rest.match(/\((\d{4})\)/);
  const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : null;

  // Remove year
  let title = rest
    .replaceAll(/\s*\(\d{4}\)\s*/g, ' ')
    .replaceAll(/\s{2,}/g, ' ')
    .trim();

  // Remove underscores used as emphasis markers
  title = title.replaceAll('_', '').trim();

  const id = name; // filename stem is the canonical key

  return { id, artist, title, year, filename };
}

const files = readdirSync(MEDIA_DIR)
  .filter(f => f.endsWith('.mp3') && !f.endsWith('.embedded.mp3'))
  .sort();

const albums = files.map(f => {
  const parsed = parseFilename(f);
  if (!parsed) {
    console.error(`Could not parse: ${f}`);
    return null;
  }
  return parsed;
}).filter(Boolean);

const outPath = join(__dirname, 'cache', 'albums-raw.json');
writeFileSync(outPath, JSON.stringify(albums, null, 2));

console.log(`Wrote ${albums.length} albums to ingest/cache/albums-raw.json`);
albums.forEach(a => {
  const year = a.year ? ` (${a.year})` : '';
  console.log(`  ${a.id.padEnd(55)} ${a.artist} — ${a.title}${year}`);
});
