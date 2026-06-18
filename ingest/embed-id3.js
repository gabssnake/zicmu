#!/usr/bin/env node
// Embeds album metadata (title, artist, year, cover, chapter markers) into MP3 files.
// Reads albums.json, produces media/<id>.embedded.mp3 for each album.
// Run after build-albums.js. Skips albums that already have an embedded version.
//
// Usage:
//   node ingest/embed-id3.js                 # embed all albums
//   node ingest/embed-id3.js "Arctic Monkeys - AM (2013)"  # single album by id

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Escape values for ffmeta format (keys/values must not contain raw =, ;, #, \, or newlines)
function esc(v) {
  return String(v ?? '').replace(/[=;#\\]/g, c => `\\${c}`).replace(/\n/g, '\\n');
}

function audioDurationMs(path) {
  const r = spawnSync('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', path,
  ]);
  return Math.round(parseFloat(r.stdout.toString().trim()) * 1000) || 0;
}

function buildFfmeta(album, totalMs) {
  const lines = [
    ';FFMETADATA1',
    `title=${esc(album.title)}`,
    `artist=${esc(album.artist)}`,
    `album=${esc(album.title)}`,
  ];
  if (album.year != null) lines.push(`date=${esc(album.year)}`);
  lines.push('');

  for (let i = 0; i < album.tracks.length; i++) {
    const t = album.tracks[i];
    const start = Math.round(t.start * 1000);
    if (start >= totalMs) break; // track beyond audio duration (e.g. partial/preview files)
    const end = i + 1 < album.tracks.length
      ? Math.min(Math.round(album.tracks[i + 1].start * 1000), totalMs)
      : totalMs;
    lines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${start}`, `END=${end}`, `title=${esc(t.title)}`, '');
  }

  return lines.join('\n');
}

const albums = JSON.parse(readFileSync(join(ROOT, 'albums.json'), 'utf8'));
const filterArg = process.argv[2];

let done = 0, skipped = 0, failed = 0;

for (const album of albums) {
  if (filterArg && album.id !== filterArg) continue;

  const src = join(ROOT, album.audio);
  const out = src.replace(/\.mp3$/i, '.embedded.mp3');
  const coverFile = album.cover ? join(ROOT, album.cover) : null;
  const hasCover = !!coverFile && existsSync(coverFile);

  if (existsSync(out)) { skipped++; continue; }
  if (!existsSync(src)) { console.error(`missing  ${album.id}`); failed++; continue; }

  process.stdout.write(`embed  ${album.id} ... `);

  const metaPath = join(tmpdir(), `zicmu-${process.pid}.ffmeta`);
  writeFileSync(metaPath, buildFfmeta(album, audioDurationMs(src)));

  // Build ffmpeg args: audio input, optional cover input, ffmeta input
  const args = ['-y', '-i', src];
  if (hasCover) args.push('-i', coverFile);
  args.push('-i', metaPath);

  const metaIdx = hasCover ? 2 : 1;
  if (hasCover) {
    args.push('-map', '0:a', '-map', '1:v');
  } else {
    args.push('-map', '0:a');
  }
  args.push('-c', 'copy', '-map_metadata', String(metaIdx), '-id3v2_version', '3', out);

  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] });
  unlinkSync(metaPath);

  if (r.status === 0) { process.stdout.write('done\n'); done++; }
  else { process.stdout.write('fail\n'); failed++; }
}

console.log(`\n${done} embedded, ${skipped} skipped (already exist), ${failed} failed`);
