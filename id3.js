// ID3v2 reader for browser File objects.
//
// Usage:
//   import { parseID3, filterFiles, makeAlbum } from './id3.js';
//
//   const files  = filterFiles(input.files);     // prefer .embedded.mp3, dedup
//   const tags   = await parseID3(file);         // { title, artist, album, year, cover, chapters }
//   const album  = makeAlbum(file, tags);        // zicmu album object ready for createPlayer()

// ---- internal helpers ----

function decodeText(bytes) {
  if (!bytes.length) return '';
  const enc = bytes[0];
  const rest = bytes.subarray(1);
  try {
    if (enc === 0) return new TextDecoder('iso-8859-1').decode(rest).replace(/\0+$/, '').trim();
    if (enc === 1) return new TextDecoder('utf-16').decode(rest).replace(/\0+$/, '').trim();
    if (enc === 2) return new TextDecoder('utf-16be').decode(rest).replace(/\0+$/, '').trim();
    if (enc === 3) return new TextDecoder('utf-8').decode(rest).replace(/\0+$/, '').trim();
  } catch {}
  return '';
}

function u32(bytes, i) {
  return ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
}

function parseAPIC(bytes) {
  const enc = bytes[0];
  let i = 1;
  const mimeStart = i;
  while (i < bytes.length && bytes[i] !== 0) i++;
  const mime = new TextDecoder('iso-8859-1').decode(bytes.subarray(mimeStart, i)) || 'image/jpeg';
  i++; // past MIME null
  i++; // picture type byte
  if (enc === 1 || enc === 2) {
    while (i + 1 < bytes.length && (bytes[i] !== 0 || bytes[i + 1] !== 0)) i += 2;
    i += 2;
  } else {
    while (i < bytes.length && bytes[i] !== 0) i++;
    i++;
  }
  if (i >= bytes.length) return null;
  return URL.createObjectURL(new Blob([bytes.subarray(i)], { type: mime }));
}

function parseCHAP(bytes) {
  let i = 0;
  while (i < bytes.length && bytes[i] !== 0) i++;
  i++; // past element-id null terminator
  if (i + 16 > bytes.length) return null;
  const startMs = u32(bytes, i);
  i += 16; // skip startMs, endMs, startOffset, endOffset (4 × uint32)
  let title = '';
  while (i + 10 <= bytes.length) {
    const subId = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const subSize = u32(bytes, i + 4);
    if (i + 10 + subSize > bytes.length) break;
    if (subId === 'TIT2') title = decodeText(bytes.subarray(i + 10, i + 10 + subSize));
    i += 10 + subSize;
  }
  return { startMs, title };
}

// ---- public API ----

// Parse ID3v2.3 or ID3v2.4 tags from a browser File.
// Returns { title, artist, album, year, cover (blob URL | null), chapters: [{ startMs, title }] }.
export async function parseID3(file) {
  const tags = { title: null, artist: null, album: null, year: null, cover: null, chapters: [] };

  const headerBytes = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (headerBytes[0] !== 0x49 || headerBytes[1] !== 0x44 || headerBytes[2] !== 0x33) return tags;

  const version = headerBytes[3];
  if (version < 3 || version > 4) return tags;

  const tagSize =
    ((headerBytes[6] & 0x7F) << 21) |
    ((headerBytes[7] & 0x7F) << 14) |
    ((headerBytes[8] & 0x7F) << 7)  |
     (headerBytes[9] & 0x7F);

  const bytes = new Uint8Array(await file.slice(0, tagSize + 10).arrayBuffer());

  let pos = 10;
  while (pos + 10 <= tagSize + 10) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    if (id === '\0\0\0\0') break;

    const frameSize = version === 4
      ? ((bytes[pos + 4] & 0x7F) << 21) | ((bytes[pos + 5] & 0x7F) << 14) | ((bytes[pos + 6] & 0x7F) << 7) | (bytes[pos + 7] & 0x7F)
      : u32(bytes, pos + 4);

    if (frameSize <= 0 || pos + 10 + frameSize > bytes.length) break;
    const payload = bytes.subarray(pos + 10, pos + 10 + frameSize);
    pos += 10 + frameSize;

    try {
      switch (id) {
        case 'TIT2': tags.title  = decodeText(payload); break;
        case 'TPE1': tags.artist = decodeText(payload); break;
        case 'TPE2': if (!tags.artist) tags.artist = decodeText(payload); break;
        case 'TALB': tags.album  = decodeText(payload); break;
        case 'TYER': case 'TDRC': {
          const y = parseInt(decodeText(payload).slice(0, 4), 10);
          if (!isNaN(y)) tags.year = y;
          break;
        }
        case 'APIC': if (!tags.cover) tags.cover = parseAPIC(payload); break;
        case 'CHAP': { const ch = parseCHAP(payload); if (ch) tags.chapters.push(ch); break; }
      }
    } catch {}
  }

  return tags;
}

// Filter a FileList to MP3s, deduplicating stems that have both a plain and .embedded version.
// When both exist, the .embedded.mp3 is kept and the plain .mp3 is dropped.
export function filterFiles(fileList) {
  const all = Array.from(fileList).filter(f => /\.mp3$/i.test(f.name));
  const embeddedStems = new Set(
    all
      .filter(f => /\.embedded\.mp3$/i.test(f.name))
      .map(f => f.name.replace(/\.embedded\.mp3$/i, ''))
  );
  return all.filter(f =>
    /\.embedded\.mp3$/i.test(f.name) ||
    !embeddedStems.has(f.name.replace(/\.mp3$/i, ''))
  );
}

// Convert a File + its parsed tags into a zicmu album object for createPlayer().
// Falls back to filename parsing for missing metadata.
export function makeAlbum(file, tags) {
  const stem = file.name.replace(/\.embedded\.mp3$/i, '').replace(/\.mp3$/i, '');
  const [, fallbackArtist, fallbackTitle] = stem.match(/^(.+?) - (.+?)(?:\s*\(\d+\))?$/) || [];

  const tracks = tags.chapters.length > 0
    ? tags.chapters
        .sort((a, b) => a.startMs - b.startMs)
        .map(ch => ({ title: ch.title || '—', start: Math.round(ch.startMs / 1000) }))
    : [{ title: tags.album || tags.title || stem, start: 0 }];

  return {
    id:     stem,
    title:  tags.album  || tags.title  || fallbackTitle  || stem,
    artist: tags.artist || fallbackArtist || 'Unknown',
    year:   tags.year ?? null,
    cover:  tags.cover ?? null,
    audio:  URL.createObjectURL(file),
    tracks,
  };
}
