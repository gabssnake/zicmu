#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEDIA_DIR = join(ROOT, 'media');

const albums = readdirSync(MEDIA_DIR)
  .filter(f => f.endsWith('.json'))
  .sort()
  .map(f => JSON.parse(readFileSync(join(MEDIA_DIR, f), 'utf8')));

writeFileSync(join(ROOT, 'albums.json'), JSON.stringify(albums, null, 2));

const withCovers = albums.filter(a => a.cover).length;
const needsReview = albums.filter(a => a._review).length;
console.log(`albums.json: ${albums.length} albums, ${withCovers} with covers, ${needsReview} flagged for review`);
