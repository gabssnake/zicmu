# Prompt: verify album timestamps

Use this prompt with an AI assistant to guide manual timestamp review for a flagged album.

Run `node ingest/validate-reviews.js` first to see which albums need attention.

---

I have an album in my music player where the track timestamps were auto-detected and may be wrong.
I need to verify and correct them manually.

The album data is in `ingest/cache/tracks/<id>.json`. Each track has:
- `title`: track name
- `start`: start time in seconds from the beginning of the audio file
- `source`: where the timestamp came from (`api`, `detected`, `manual`)
- `confidence`: `high`, `medium`, or `low`

## My workflow

1. Open the player at `http://localhost:8765/skins/classic.html`
2. Load the album and play it
3. For each track, click on it and note what's actually playing at that moment
4. If the boundary is wrong, find the real start by scrubbing

## What to look for

- Track skips the first few seconds → `start` is too high, reduce it
- Previous track ends early and current track starts mid-song → `start` is too low, increase it
- Two consecutive tracks are actually one continuous piece → they may need merging

## Fixing the data

Edit `ingest/cache/tracks/<id>.json`:
1. Correct each `start` value (seconds, decimal OK: `183.4`)
2. Set `"needsManualReview": false` when all tracks are verified
3. Run `node ingest/build-albums.js` to rebuild `albums.json`
4. Refresh the player and re-check

## Asking for help

Paste the contents of the tracks JSON here and describe what you're hearing (e.g. "track 3 says
it starts at 243s but the actual new track starts around 251s"). I can help figure out the correct
values and suggest edits.
