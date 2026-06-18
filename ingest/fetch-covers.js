import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MEDIA_DIR = join(ROOT, 'media');
const DATA_DIR = join(__dirname, 'cache');
const REPORT_PATH = join(DATA_DIR, 'covers-report.json');
const MB_UA = 'zicmu/1.0 (personal music player)';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- helpers ---

function yearDiff(dateStr, year) {
  if (!year || !dateStr) return 999;
  const y = Number.parseInt(dateStr.slice(0, 4), 10);
  return Number.isNaN(y) ? 999 : Math.abs(y - year);
}

// Tokenize title for fuzzy matching: lowercase, letters+numbers only, split to words
function tokenize(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

// Score how well resultTitle matches searchTitle (0 = no match, 100 = exact)
function titleScore(resultTitle, searchTitle) {
  const rt = tokenize(resultTitle);
  const st = tokenize(searchTitle);
  if (rt.join(' ') === st.join(' ')) return 100;
  // all search tokens must appear as individual result tokens (not substrings)
  const rtSet = new Set(rt);
  if (st.every(t => rtSet.has(t))) return 80;
  // partial: at least half the search tokens match
  const matchCount = st.filter(t => rtSet.has(t)).length;
  if (matchCount >= Math.ceil(st.length / 2)) return 50;
  return 0;
}

// Strip trailing Roman numeral if it's a standalone suffix added by the rip (e.g. "Led Zeppelin I")
// Only strip if the bare title without the numeral is likely the official name
function mbSearchTitle(title) {
  const stripped = title.replace(/\s+[IVX]+$/, '').trim();
  // return both: search with original first, fallback to stripped
  return [title, stripped].filter((v, i, a) => a.indexOf(v) === i);
}

// --- MusicBrainz ---

async function searchMB(artist, title, year) {
  const queries = mbSearchTitle(title).map(t => `artist:${artist} AND release:${t}`);
  for (const q of queries) {
    const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(q)}&limit=10&fmt=json`;
    await sleep(1150);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': MB_UA } });
      if (!res.ok) continue;
      const data = await res.json();
      const releases = (data.releases ?? []).filter(r =>
        ['Album', 'Compilation'].includes(r['release-group']?.['primary-type'])
      );
      if (!releases.length) continue;
      // sort by year closeness
      releases.sort((a, b) => yearDiff(a.date, year) - yearDiff(b.date, year));
      return releases[0];
    } catch {
      // try next query
    }
  }
  return null;
}

async function tryMBCover(release) {
  const rgId = release['release-group']?.id;
  const releaseId = release.id;

  // prefer release-group (canonical) over release
  for (const urlPath of [
    `https://coverartarchive.org/release-group/${rgId}/front`,
    `https://coverartarchive.org/release/${releaseId}/front`,
  ]) {
    if (!rgId && urlPath.includes('release-group')) continue;
    try {
      const res = await fetch(urlPath);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 5000) continue; // skip tiny placeholder images
      return buf;
    } catch {
      // try next
    }
  }
  return null;
}

// --- iTunes ---

async function tryITunes(artist, title, year) {
  const countries = ['US', 'FR', 'AR', 'ES'];
  for (const country of countries) {
    try {
      const q = `${artist} ${title}`;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&media=music&limit=25&country=${country}`;
      const data = await fetch(url).then(r => r.json());
      const results = (data.results ?? []).filter(r =>
        tokenize(r.artistName ?? '').some(t => tokenize(artist).includes(t))
      );
      if (!results.length) continue;
      // score by title match and year
      const scored = results.map(r => ({
        r,
        titleScore: titleScore(r.collectionName ?? '', title),
        yd: yearDiff(String(r.releaseDate ?? ''), year),
      }));
      scored.sort((a, b) => b.titleScore - a.titleScore || a.yd - b.yd);
      const best = scored.find(s => s.titleScore >= 50);
      if (!best) continue;
      // get high-res by replacing size token in URL
      const artUrl = best.r.artworkUrl100?.replace('100x100bb', '1200x1200bb');
      if (!artUrl) continue;
      const imgRes = await fetch(artUrl);
      if (!imgRes.ok) continue;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.byteLength < 5000) continue;
      return { buf, country, album: best.r.collectionName, score: best.titleScore };
    } catch {
      // try next country
    }
  }
  return null;
}

// --- main per-album ---

async function processAlbum(album) {
  if (existsSync(join(MEDIA_DIR, `${album.id}.jpg`))) {
    return { id: album.id, status: 'exists' };
  }

  // strip side indicators for search
  const searchTitle = album.title.replace(/[-–]\s*side\s+[ab]$/i, '').trim();

  // 1. Try MusicBrainz → Cover Art Archive (release-group)
  let mbRelease = null;
  try {
    mbRelease = await searchMB(album.artist, searchTitle, album.year);
  } catch (err) {
    console.error(`  MB search failed for ${album.id}: ${err.message}`);
  }

  if (mbRelease) {
    try {
      const buf = await tryMBCover(mbRelease);
      if (buf) {
        writeFileSync(join(MEDIA_DIR, `${album.id}.jpg`), buf);
        return {
          id: album.id,
          status: 'found',
          source: 'musicbrainz',
          mbid: mbRelease.id,
          rgid: mbRelease['release-group']?.id,
        };
      }
    } catch (err) {
      console.error(`  CAA failed for ${album.id}: ${err.message}`);
    }
  }

  // 2. Try iTunes (multiple countries)
  try {
    const itResult = await tryITunes(album.artist, searchTitle, album.year);
    if (itResult) {
      writeFileSync(join(MEDIA_DIR, `${album.id}.jpg`), itResult.buf);
      return {
        id: album.id,
        status: 'found',
        source: `itunes-${itResult.country}`,
        itunesAlbum: itResult.album,
        titleScore: itResult.score,
      };
    }
  } catch (err) {
    console.error(`  iTunes failed for ${album.id}: ${err.message}`);
  }

  return { id: album.id, status: 'not-found' };
}

function fmtRow(record, album) {
  const id = album.id.length > 44 ? album.id.slice(0, 41) + '...' : album.id.padEnd(44);
  const src = record.source ?? record.reason ?? 'none';
  return `${id} → ${record.status.padEnd(12)} (${src})  ${album.artist} - ${album.title}`;
}

mkdirSync(MEDIA_DIR, { recursive: true });

const albums = JSON.parse(readFileSync(join(DATA_DIR, 'albums-raw.json'), 'utf8'));
const report = [];

for (const album of albums) {
  process.stdout.write(`  processing ${album.id}...\r`);
  const record = await processAlbum(album);
  report.push(record);
  console.log(fmtRow(record, album));
}

writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\n${report.filter(r => r.status === 'found').length}/${albums.length} covers found`);
console.log(`report written to ${REPORT_PATH}`);
