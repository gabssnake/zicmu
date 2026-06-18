#!/usr/bin/env node
import { readdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';

const MEDIA_DIR = new URL('../media', import.meta.url).pathname;

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

// Parse "Artist - Title (Year).mp3" or "Artist - Title (Year) - Suffix.mp3"
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

  // Remove year, preserving surrounding whitespace as a single space
  let title = rest
    .replace(/\s*\(\d{4}\)\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Remove leading/trailing " - Suffix" only if it's a side designation
  const sideMatch = title.match(/^(.*?)\s+-\s+(Side\s+[AB])$/i);
  let suffix = null;
  if (sideMatch) {
    title = sideMatch[1].trim();
    suffix = sideMatch[2].trim();
  }

  // Remove underscores used as emphasis markers (One Love filename uses _One Love_)
  title = title.replace(/_/g, '').trim();

  const artistSlug = toSlug(artist);
  let titleSlug = toSlug(title);
  if (suffix) titleSlug += '-' + toSlug(suffix);

  const id = `${artistSlug}_${titleSlug}`;

  return { id, artist, title, year, suffix, filename };
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

// Apply special flags
for (const a of albums) {
  if (a.id === 'georges-moustaki_il-y-avait-un-jardin') {
    a.singleTrack = true;
  }
  if (a.id === 'bob-marley-and-the-wailers_one-love-and-redemption-song') {
    a.manualTracks = true;
    a.manualTrackTitles = ['One Love', 'Redemption Song'];
  }
}

const outPath = new URL('albums-raw.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(albums, null, 2));

console.log(`Wrote ${albums.length} albums to prep/albums-raw.json`);
albums.forEach(a => {
  const flags = [a.singleTrack && 'singleTrack', a.manualTracks && 'manualTracks'].filter(Boolean).join(', ');
  console.log(`  ${a.id.padEnd(55)} ${a.artist} — ${a.title}${a.year ? ` (${a.year})` : ''}${flags ? `  [${flags}]` : ''}`);
});
