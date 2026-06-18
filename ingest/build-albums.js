#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(__dirname, 'cache');

const rawAlbums = JSON.parse(readFileSync(join(DATA_DIR, 'albums-raw.json'), 'utf8'));
const coversReport = JSON.parse(readFileSync(join(DATA_DIR, 'covers-report.json'), 'utf8'));

const coversByid = Object.fromEntries(coversReport.map(r => [r.id, r]));

const albums = rawAlbums.map(album => {
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

  return entry;
});

const outPath = join(ROOT, 'albums.json');
writeFileSync(outPath, JSON.stringify(albums, null, 2));

// summary
const withCovers = albums.filter(a => a.cover).length;
const withTracks = albums.filter(a => a.tracks.length > 1).length;
const needsReview = albums.filter(a => a._review).length;

console.log(`albums.json written with ${albums.length} entries`);
console.log(`  covers: ${withCovers}/${albums.length}`);
console.log(`  multi-track: ${withTracks}/${albums.length}`);
console.log(`  needs review: ${needsReview}/${albums.length}`);
console.log(`\nneeds-review albums:`);
albums.filter(a => a._review).forEach(a => console.log(`  ${a.id}  (${a.tracks.length} tracks)`));
