# Skin contract

A zicmu skin is a self-contained HTML file in `skins/`. It imports the audio engine and renders whatever UI it wants. The engine and skin never share DOM, they communicate only through events and commands.

## Required setup

```html
<base href="../">   <!-- resolve player.js and albums.json from root -->
```

```js
import createPlayer from './player.js';
// or, using skin.js:
import { initPlayer } from './skin.js';

const albums = await fetch('albums.json').then(r => r.json());
const player = createPlayer(albums);
```

## Events to handle

These are the signals the engine emits. A skin subscribes to whichever it needs.

| Event | Payload | When |
|-------|---------|------|
| `albumloaded` | `{ album }` | A new album was loaded (or restored from localStorage) |
| `trackchange` | `{ album, trackIndex, track }` | Active track changed (by seek, auto-advance, or restore) |
| `play` | — | Playback started |
| `pause` | — | Playback paused or stopped |
| `timeupdate` | `{ currentTime, duration, progress }` | ~4× per second while playing |
| `volumechange` | `{ volume }` | Volume changed (by skin or OS) |
| `albumended` | `{ album }` | Last track finished playing |

Subscribe with `player.on(event, fn)`, unsubscribe with `player.off(event, fn)`.

## Commands

```js
player.loadAlbum(album, trackIndex = 0)   // load a new album, seek to track
player.seekToTrack(index)                 // jump to track within current album
player.seekToTime(seconds)               // seek to absolute time, updates track index
player.play()
player.pause()
player.toggle()
player.prevTrack()
player.nextTrack()
player.volume = 0.8                       // settable, 0–1
```

## State getters

```js
player.albums            // full album list
player.currentAlbum      // null until an album is loaded
player.currentTrackIndex
player.isPlaying
player.currentTime       // absolute seconds in the audio file
player.duration          // total audio file duration
player.volume            // 0–1
```

## Utilities (skin.js)

Import from `./skin.js` to avoid duplicating these helpers:

```js
import { initPlayer, formatTime, trackDuration, trackProgress,
         seekFromClick, setupKeyboard } from './skin.js';

const { player, albums } = await initPlayer();  // fetch + createPlayer in one call

formatTime(185)              // "3:05"
trackDuration(tracks, i, player.duration)  // seconds for track i
trackProgress(player)        // { trackStart, trackEnd, trackDur, trackPos, pct }
seekFromClick(event, el, player)  // click or input → seekToTime()
setupKeyboard(player)        // space=toggle, ←/→=prev/next
```

## What the engine owns

- The `<audio>` element and all its state
- localStorage persistence (`zicmu-state` key)
- OS Media Session metadata (lock screen, headphone buttons)

Skins do not need to handle any of these. They render and respond to events.

## Notes

- `timeupdate` fires ~4× per second. Keep handlers fast (no layout thrashing).
- The last track shows `--:--` for duration because the total audio file duration may not be
  known until it loads. Use `trackDuration(tracks, i, player.duration)` and check for 0.
- `albumloaded` fires during init if a previous session is restored. Check `player.currentAlbum`
  on startup and render accordingly (see any existing skin for the pattern).
- Progress bar scrubbing: use an `isScrubbing` flag so `timeupdate` doesn't fight the drag.
  Seek on `mouseup`/`touchend`, not on `mousemove`.
