#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(__dirname, 'cache');
const MEDIA_DIR = join(ROOT, 'media');

const rawAlbums = JSON.parse(readFileSync(join(DATA_DIR, 'albums-raw.json'), 'utf8'));
const coversReport = JSON.parse(readFileSync(join(DATA_DIR, 'covers-report.json'), 'utf8'));

const coversByid = Object.fromEntries(coversReport.map(r => [r.id, r]));

let written = 0, skipped = 0;

for (const album of rawAlbums) {
  const dest = join(MEDIA_DIR, `${album.id}.json`);
  if (existsSync(dest)) { skipped++; continue; }

  const coverRecord = coversByid[album.id];
  const tracksPath = join(DATA_DIR, 'tracks', `${album.id}.json`);
  const tracksData = existsSync(tracksPath)
    ? JSON.parse(readFileSync(tracksPath, 'utf8'))
    : null;

  // strip internal metadata fields from tracks (keep only title + start)
  const tracks = (tracksData?.tracks ?? []).map(t => ({ title: t.title, start: t.start }));

  const entry = {
    id: album.id,
    title: album.title,
    artist: album.artist,
    ...(album.year && { year: album.year }),
    audio: `media/${album.filename}`,
    tracks,
  };

  // only include cover if it was successfully fetched
  if (coverRecord?.status === 'found' || coverRecord?.status === 'found-ambiguous') {
    entry.cover = `media/${album.id}.jpg`;
  }

  // carry review flag for albums that need manual attention
  if (tracksData?.needsManualReview) {
    entry._review = true;
  }

  writeFileSync(dest, JSON.stringify(entry, null, 2));
  written++;
}

console.log(`wrote ${written} new album files, skipped ${skipped} (already exist)`);
console.log(`run node ingest/build-index.js to rebuild albums.json`);
