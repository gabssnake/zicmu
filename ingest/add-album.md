# Prompt: add a new album

Use this prompt with an AI assistant to generate a valid entry for `ingest/cache/albums-raw.json`.

---

I'm adding a new album to zicmu, a static music player. I need a JSON entry for the album metadata file.

The album is:
- Artist: [ARTIST NAME]
- Title: [ALBUM TITLE]
- Year: [YEAR]
- Audio filename: [FILENAME.mp3]  ← the MP3 file you already have in media/

Generate a JSON object with these fields:
```json
{
  "id": "artist-name_album-title",
  "title": "Album Title",
  "artist": "Artist Name",
  "year": 1970,
  "filename": "filename.mp3"
}
```

Rules for `id`:
- Lowercase only, no accents
- Words separated by hyphens within artist/title
- Artist and title separated by `_`
- Example: "Bob Marley and the Wailers — Legend" → `bob-marley-and-the-wailers_legend`

If the album has exactly two sides (e.g. a double-LP ripped as two files), create two entries
with `-side-a` and `-side-b` suffixes on the id and title.

If it's a single-track file with no track boundaries:
```json
{
  ...,
  "singleTrack": true
}
```

After generating the entry, append it to `ingest/cache/albums-raw.json` and run:
```
node ingest/fetch-tracks.js    # fetches track timestamps from MusicBrainz
node ingest/fetch-covers.js    # downloads cover art
node ingest/build-albums.js    # rebuilds albums.json
```

Then copy the audio file to `media/` and the cover (if any) will be at `media/<id>.jpg`.
