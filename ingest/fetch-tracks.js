import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(__dirname, 'cache');
const ALBUMS = JSON.parse(readFileSync(join(DATA_DIR, 'albums-raw.json'), 'utf8'));
const TRACKS_DIR = join(DATA_DIR, 'tracks');
const MB_DELAY = 1100;

if (!existsSync(TRACKS_DIR)) mkdirSync(TRACKS_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function detectSilences(filename, minGapSec = 30) {
  const output = execSync(
    `ffmpeg -i "media/${filename}" -af "silencedetect=noise=-35dB:d=0.5" -f null - 2>&1`,
    { cwd: PROJECT_ROOT, maxBuffer: 10 * 1024 * 1024 }
  ).toString();
  const all = [...output.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => Number.parseFloat(m[1]));
  // deduplicate: keep only silences at least minGapSec apart from the previous one
  const filtered = [];
  let last = -Infinity;
  for (const t of all) {
    if (t - last >= minGapSec) { filtered.push(t); last = t; }
  }
  return filtered;
}

function parseDuration(str) {
  // "3:45" -> seconds
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function crossReference(apiTracks, silences) {
  return apiTracks.map((track, i) => {
    if (i === 0) return { ...track, start: 0, source: 'api', confidence: 'high' };
    const match = silences.find(s => Math.abs(s - track.start) <= 10);
    if (match !== undefined) {
      return { ...track, start: match, source: 'detected', confidence: 'high' };
    }
    return { ...track, source: 'api', confidence: 'medium' };
  });
}

// Strip trailing Roman numeral suffix added by the rip (e.g. "Led Zeppelin I" → "Led Zeppelin")
function mbTitleVariants(title) {
  const stripped = title.replace(/\s+[IVX]+$/, '').trim();
  return [title, stripped].filter((v, i, a) => a.indexOf(v) === i);
}

// Strip side indicator for Rastaman Vibration-style titles
function mbSearchTitle(album) {
  return album.title.replace(/[-–]\s*side\s+[ab]$/i, '').trim();
}

async function fetchMusicBrainz(album) {
  const headers = { 'User-Agent': 'zicmu/1.0 (personal music player)' };
  const baseTitle = mbSearchTitle(album);
  const titleVariants = mbTitleVariants(baseTitle);

  let bestRelease = null;
  for (const title of titleVariants) {
    // unquoted query — more permissive, avoids Broadcast-only results
    const q = `artist:${album.artist} AND release:${title}`;
    const searchUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(q)}&limit=10&fmt=json`;

    await sleep(MB_DELAY);
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();

    const releases = (searchData.releases || []).filter(r => {
      const type = r['release-group']?.['primary-type'];
      if (type !== 'Album' && type !== 'Compilation') return false; // exclude Broadcast etc.
      const media = r.media || [];
      return media.some(m => (m['track-count'] || 0) > 0);
    });

    if (!releases.length) continue;

    // sort by year closeness
    releases.sort((a, b) => {
      const ay = a.date ? Math.abs((album.year || 0) - Number.parseInt(a.date.slice(0, 4))) : 999;
      const by = b.date ? Math.abs((album.year || 0) - Number.parseInt(b.date.slice(0, 4))) : 999;
      return ay - by;
    });
    bestRelease = releases[0];
    break;
  }

  if (!bestRelease) return null;

  await sleep(MB_DELAY);
  const detailRes = await fetch(
    `https://musicbrainz.org/ws/2/release/${bestRelease.id}?inc=recordings&fmt=json`,
    { headers }
  );
  if (!detailRes.ok) throw new Error(`MB detail ${detailRes.status}`);
  const detail = await detailRes.json();

  const rawTracks = detail.media?.[0]?.tracks;
  if (!rawTracks?.length) return null;

  let cursor = 0;
  const tracks = rawTracks.map(t => {
    const start = cursor;
    const lengthSec = (t.length || 0) / 1000;
    cursor += lengthSec;
    return { title: t.title, start };
  });

  return { tracks, mbid: bestRelease.id, source: 'musicbrainz' };
}

async function fetchDiscogs(album) {
  const artist = encodeURIComponent(album.artist);
  const title = encodeURIComponent(album.title);
  const searchUrl = `https://api.discogs.com/database/search?artist=${artist}&release_title=${title}&type=release&per_page=3`;
  const headers = { 'User-Agent': 'zicmu/1.0 (personal music player)' };

  const searchRes = await fetch(searchUrl, { headers });
  if (!searchRes.ok) throw new Error(`Discogs search ${searchRes.status}`);
  const searchData = await searchRes.json();

  const results = searchData.results || [];
  if (!results.length) return null;

  const detailRes = await fetch(
    `https://api.discogs.com/releases/${results[0].id}`,
    { headers }
  );
  if (!detailRes.ok) throw new Error(`Discogs detail ${detailRes.status}`);
  const detail = await detailRes.json();

  const tracklist = (detail.tracklist || []).filter(t => t.type_ === 'track' || !t.type_);
  if (!tracklist.length) return null;

  let cursor = 0;
  const tracks = tracklist.map(t => {
    const start = cursor;
    const dur = t.duration ? parseDuration(t.duration) : 0;
    cursor += dur;
    return { title: t.title, start };
  });

  return { tracks, source: 'discogs' };
}

function trySilences(album) {
  try {
    return detectSilences(album.filename);
  } catch (e) {
    console.error(`silence detection failed for ${album.id}: ${e.message}`);
    return [];
  }
}

async function fetchApiTracks(album) {
  try {
    const result = await fetchMusicBrainz(album);
    if (result) return result;
  } catch (e) {
    console.error(`musicbrainz failed for ${album.id}: ${e.message}`);
  }
  try {
    return await fetchDiscogs(album);
  } catch (e) {
    console.error(`discogs failed for ${album.id}: ${e.message}`);
    return null;
  }
}

function writeOut(id, data) {
  writeFileSync(join(TRACKS_DIR, `${id}.json`), JSON.stringify(data, null, 2));
}

async function processAlbum(album) {
  if (existsSync(join(TRACKS_DIR, `${album.id}.json`))) {
    return { album, skipped: true };
  }

  const apiResult = await fetchApiTracks(album);

  if (!apiResult || apiResult.tracks.length === 0) {
    // no API data: fall back to silence detection with numbered track titles
    const silences = trySilences(album);
    const boundaries = [0, ...silences];
    const tracks = boundaries.map((start, i) => ({
      title: `Track ${i + 1}`,
      start,
      source: 'detected',
      confidence: 'low',
    }));
    writeOut(album.id, {
      id: album.id,
      source: 'silence-only',
      needsManualReview: true,
      tracks,
    });
    return { album, trackCount: tracks.length, expected: '?', source: 'silence-only', review: true };
  }

  const { tracks: apiTracks, mbid, source } = apiResult;
  const expected = apiTracks.length;
  const silences = expected > 1 ? trySilences(album) : [];
  const tracks = crossReference(apiTracks, silences);
  const detectedCount = tracks.filter(t => t.source === 'detected').length;
  const needsManualReview = expected > 1 && detectedCount < expected - 2;

  writeOut(album.id, {
    id: album.id,
    source,
    ...(mbid ? { mbid } : {}),
    needsManualReview,
    tracks
  });
  return { album, trackCount: tracks.length, expected, source, review: needsManualReview };
}

const results = [];
for (const album of ALBUMS) {
  try {
    const r = await processAlbum(album);
    results.push(r);
    if (r.skipped) {
      console.log(`${album.id.padEnd(50)} skipped (cached)`);
    } else {
      const exp = r.expected === '?' ? '?' : r.expected;
      console.log(`${album.id.padEnd(50)} ${r.trackCount}/${exp} tracks`);
    }
  } catch (e) {
    console.error(`failed ${album.id}: ${e.message}`);
    results.push({ album, trackCount: 0, expected: '?', source: 'error', review: true });
  }
}

const fetched = results.filter(r => !r.skipped && r.source !== 'error');
const skipped = results.filter(r => r.skipped);
console.log(`\n--- summary: ${fetched.length} fetched, ${skipped.length} skipped (cached) ---`);
for (const r of fetched) {
  const exp = r.expected === '?' ? '?' : r.expected;
  console.log(
    `${r.album.id.padEnd(50)} ${r.trackCount}/${exp} tracks`.padEnd(65) +
    `  source=${r.source}`.padEnd(25) +
    `  review=${r.review}`
  );
}
