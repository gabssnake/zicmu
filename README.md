# zicmu

A static music player for a personal MP3 collection. No backend, no database — just a JSON file, an audio engine, and interchangeable skins.

Hosted on GitHub Pages. Audio files are served as static assets with HTTP range request support for seeking.

## How it works

`player.js` is a decoupled audio engine: it exposes a small event/command API and owns nothing visual. Skins are self-contained HTML files that subscribe to player events and call player commands. They can look like anything.

`skin.js` provides shared utilities (time formatting, progress math, keyboard shortcuts) that skins can optionally import.

## Skins

Eight skins live in `skins/`. Open `index.html` to browse them.

| Skin | File | Style |
|------|------|-------|
| Classic | skins/classic.html | Sidebar + tracklist, plain dark |
| Groove | skins/groove.html | Single-column, two-tab layout |
| Liner | skins/liner.html | Editorial paper-white, vinyl animation |
| Liner Notes | skins/liner-notes.html | Liner + side-by-side notes panel |
| Aura | skins/aura.html | Immersive dark, ambient blur |
| Winamp | skins/winamp.html | Retro compact, LED display, EQ bars |
| Stream | skins/stream.html | Full-screen blurred album art |
| Neo | skins/neo.html | Neomorphic soft UI, rotating cover |

See `skins/SKINS.md` for the full skin contract.

## Running locally

```bash
node serve.js
```

Opens at `http://localhost:8765`. The custom server is required — standard static servers don't support HTTP range requests, which breaks audio seeking.

## Adding albums

See `ingest/INGEST.md` for the full pipeline. Short version:

1. Drop the MP3 into `media/`
2. Add an entry to `ingest/cache/albums-raw.json`
3. Run the pipeline:
   ```bash
   node ingest/fetch-tracks.js   # track timestamps from MusicBrainz
   node ingest/fetch-covers.js   # cover art from Cover Art Archive
   node ingest/build-albums.js   # assembles albums.json
   ```

## Project files

```
player.js             Audio engine (events, commands, state)
skin.js               Shared skin utilities
albums.json           Album metadata + track timestamps (generated)
serve.js              Local dev server with range request support
index.html            Skin gallery / launcher
skins/                One HTML file per skin; skins/SKINS.md documents the contract
ingest/               Scripts and AI prompts for adding new media; ingest/INGEST.md has the guide
ingest/cache/         Intermediate data (throwaway — albums-raw.json, track timestamps, cover report)
```
