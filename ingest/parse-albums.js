#!/usr/bin/env node
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(__dirname, '..', 'media');

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[àáâã]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-');
}

// Parse "Artist - Title (Year).mp3"
function parseFilename(filename) {
  const name = basename(filename, '.mp3');

  // Split on first " - "
  const dashIdx = name.indexOf(' - ');
  if (dashIdx === -1) return null;

  const artist = name.slice(0, dashIdx).replace(/_/g, '').trim();
  let rest = name.slice(dashIdx + 3).trim();

  // Extract year from parentheses
  const yearMatch = rest.match(/\((\d{4})\)/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Remove year
  let title = rest
    .replace(/\s*\(\d{4}\)\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Remove underscores used as emphasis markers
  title = title.replace(/_/g, '').trim();

  const id = `${toSlug(artist)}_${toSlug(title)}`;

  return { id, artist, title, year, filename };
}

const files = readdirSync(MEDIA_DIR)
  .filter(f => f.endsWith('.mp3'))
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
  console.log(`  ${a.id.padEnd(55)} ${a.artist} — ${a.title}${a.year ? ` (${a.year})` : ''}`);
});
