#!/usr/bin/env node
// Static file server with HTTP range request support (required for audio seeking)
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8765;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.mp3':  'audio/mpeg',
  '.jpg':  'image/jpeg',
  '.png':  'image/png',
};

createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }

  const stat = statSync(filePath);
  const total = stat.size;
  const mime = MIME[extname(filePath)] ?? 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const [, startStr, endStr] = range.match(/bytes=(\d*)-(\d*)/) ?? [];
    const start = startStr ? Number(startStr) : 0;
    const end   = endStr   ? Number(endStr)   : total - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Type': mime,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Content-Length': total,
    });
    createReadStream(filePath).pipe(res);
  }
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
