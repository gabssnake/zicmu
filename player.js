// Audio engine — decoupled from any UI.
//
// Usage:
//   import createPlayer from './player.js'
//   const player = createPlayer(albums)   // albums = parsed albums.json array
//
// Contract:
//   State (read-only getters): albums, currentAlbum, currentTrackIndex,
//                               isPlaying, currentTime, duration, volume
//   Commands: loadAlbum, seekToTrack, seekToTime, play, pause, toggle,
//             prevTrack, nextTrack
//             volume = 0..1 (settable)
//   Events: on/off — 'albumloaded', 'trackchange', 'play', 'pause',
//                    'timeupdate', 'volumechange', 'albumended'

export default function createPlayer(albums) {
  const _audio = new Audio();
  let _currentAlbum = null;
  let _currentTrackIndex = 0;
  let _lastSaveTime = 0;

  // --- event emitter ---

  const _handlers = new Map();

  function on(event, fn) {
    if (!_handlers.has(event)) _handlers.set(event, new Set());
    _handlers.get(event).add(fn);
  }

  function off(event, fn) {
    _handlers.get(event)?.delete(fn);
  }

  function emit(event, data) {
    _handlers.get(event)?.forEach(fn => fn(data));
  }

  // --- internal helpers ---

  function applySeek(start) {
    _audio.currentTime = start;
  }

  function seekWhenReady(start) {
    if (_audio.readyState >= 1) {
      applySeek(start);
    } else {
      _audio.addEventListener('loadedmetadata', () => applySeek(start), { once: true });
    }
  }

  function syncMediaSession() {
    if (!('mediaSession' in navigator) || !_currentAlbum) return;
    const track = _currentAlbum.tracks[_currentTrackIndex];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: _currentAlbum.artist,
      album: _currentAlbum.title,
      artwork: _currentAlbum.cover
        ? [{ src: _currentAlbum.cover, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });
    navigator.mediaSession.setActionHandler('play',          () => play());
    navigator.mediaSession.setActionHandler('pause',         () => pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack());
  }

  function saveState() {
    if (!_currentAlbum) return;
    localStorage.setItem('zicmu-state', JSON.stringify({
      albumId:    _currentAlbum.id,
      trackIndex: _currentTrackIndex,
      position:   _audio.currentTime,
    }));
  }

  function emitTrackChange() {
    emit('trackchange', {
      album:      _currentAlbum,
      trackIndex: _currentTrackIndex,
      track:      _currentAlbum.tracks[_currentTrackIndex],
    });
  }

  // --- audio element wiring ---

  _audio.addEventListener('play',  () => emit('play'));
  _audio.addEventListener('pause', () => emit('pause'));
  _audio.addEventListener('ended', () => emit('albumended', { album: _currentAlbum }));
  _audio.addEventListener('volumechange', () => emit('volumechange', { volume: _audio.volume }));

  _audio.addEventListener('timeupdate', () => {
    if (!_currentAlbum) return;

    // auto-advance across track boundaries
    const next = _currentAlbum.tracks[_currentTrackIndex + 1];
    if (next && _audio.currentTime >= next.start) {
      _currentTrackIndex++;
      saveState();
      syncMediaSession();
      emitTrackChange();
    }

    // throttled persistence
    const now = Date.now();
    if (now - _lastSaveTime > 5000) {
      saveState();
      _lastSaveTime = now;
    }

    emit('timeupdate', {
      currentTime: _audio.currentTime,
      duration:    _audio.duration || 0,
      progress:    _audio.duration > 0 ? _audio.currentTime / _audio.duration : 0,
    });
  });

  // --- public commands ---

  function loadAlbum(album, trackIndex = 0) {
    _currentAlbum = album;
    _currentTrackIndex = trackIndex;
    _audio.src = album.audio;
    saveState();
    syncMediaSession();
    emit('albumloaded', { album });
    emitTrackChange();
    const start = album.tracks[trackIndex].start;
    if (start > 0) seekWhenReady(start);
    play();
  }

  function seekToTrack(index) {
    if (!_currentAlbum) return;
    _currentTrackIndex = index;
    seekWhenReady(_currentAlbum.tracks[index].start);
    saveState();
    syncMediaSession();
    emitTrackChange();
  }

  function play()   { _audio.play().catch(() => {}); }
  function pause()  { _audio.pause(); }
  function toggle() { _audio.paused ? play() : pause(); }

  // Seek to an arbitrary absolute time (seconds) within the current album.
  // Preserves play/pause state and updates the active track index accordingly.
  function seekToTime(seconds) {
    if (!_currentAlbum) return;
    const wasPlaying = !_audio.paused;
    const tracks = _currentAlbum.tracks;
    let newIndex = 0;
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (seconds >= tracks[i].start) { newIndex = i; break; }
    }
    _currentTrackIndex = newIndex;
    const go = () => {
      _audio.currentTime = seconds;
      if (wasPlaying) _audio.play().catch(() => {});
    };
    _audio.readyState >= 1 ? go() : _audio.addEventListener('loadedmetadata', go, { once: true });
    saveState();
    syncMediaSession();
    emitTrackChange();
  }

  function prevTrack() {
    if (!_currentAlbum || _currentTrackIndex === 0) return;
    seekToTrack(_currentTrackIndex - 1);
  }

  function nextTrack() {
    if (!_currentAlbum || _currentTrackIndex >= _currentAlbum.tracks.length - 1) return;
    seekToTrack(_currentTrackIndex + 1);
  }

  // --- restore persisted state on init ---

  const saved = JSON.parse(localStorage.getItem('zicmu-state') || 'null');
  if (saved) {
    const album = albums.find(a => a.id === saved.albumId);
    if (album) {
      _currentAlbum = album;
      _currentTrackIndex = saved.trackIndex || 0;
      _audio.src = album.audio;
      _audio.addEventListener('loadedmetadata', () => {
        _audio.currentTime = saved.position || album.tracks[_currentTrackIndex].start;
      }, { once: true });
      syncMediaSession();
      emit('albumloaded', { album });
      emitTrackChange();
    }
  }

  // --- public interface ---

  return {
    get albums()            { return albums; },
    get currentAlbum()      { return _currentAlbum; },
    get currentTrackIndex() { return _currentTrackIndex; },
    get isPlaying()         { return !_audio.paused; },
    get currentTime()       { return _audio.currentTime; },
    get duration()          { return _audio.duration || 0; },
    get volume()            { return _audio.volume; },
    set volume(v)           { _audio.volume = Math.max(0, Math.min(1, v)); },
    loadAlbum,
    seekToTrack,
    seekToTime,
    play,
    pause,
    toggle,
    prevTrack,
    nextTrack,
    on,
    off,
  };
}
