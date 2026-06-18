#!/usr/bin/env node
// List albums that still have _review:true, with track details.
// Run after build-albums.js to see what needs manual timestamp verification.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const albums = JSON.parse(readFileSync(join(__dirname, '..', 'albums.json'), 'utf8'));

const flagged = albums.filter(a => a._review);

if (!flagged.length) {
  console.log('No albums need review.');
  process.exit(0);
}

console.log(`${flagged.length}/${albums.length} albums need timestamp review:\n`);
console.log('  Album'.padEnd(55) + 'Tracks  First track                    Last track');
console.log('  ' + '-'.repeat(100));

for (const album of flagged) {
  const first = album.tracks[0]?.title ?? '—';
  const last  = album.tracks[album.tracks.length - 1]?.title ?? '—';
  const label = `${album.artist} — ${album.title}`;
  console.log(
    `  ${label.slice(0, 52).padEnd(53)} ${String(album.tracks.length).padEnd(7)} ${first.slice(0, 30).padEnd(31)}  ${last.slice(0, 30)}`
  );
}

console.log('\nTo fix: play the album, check each track.start in ingest/cache/tracks/<id>.json,');
console.log('then set needsManualReview:false and re-run ingest/build-albums.js.');
