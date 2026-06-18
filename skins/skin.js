// Shared utilities for zicmu skins.
//
// Usage:
//   import { initPlayer, formatTime, trackDuration, trackProgress,
//            seekFromClick, setupKeyboard } from './skin-kit.js';
//
// All functions are pure or have no DOM opinions — skins stay in control of their markup.

import createPlayer from './player.js';

// Bootstrap: fetch albums.json, create the player, return { player, albums }.
// Every skin calls these two lines; initPlayer() wraps them into one.
export async function initPlayer() {
  const albums = await fetch('albums.json').then(r => r.json());
  const player = createPlayer(albums);
  return { player, albums };
}

// Format seconds as "m:ss" (e.g. 185 → "3:05"). Returns "0:00" for invalid input.
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

// Duration in seconds of track at [index] within album.tracks.
// Uses the next track's start as the boundary; falls back to audioDuration for the last track.
// Returns 0 if the boundary cannot be determined.
export function trackDuration(tracks, index, audioDuration = 0) {
  const next = tracks[index + 1];
  if (next != null) return next.start - tracks[index].start;
  return audioDuration > 0 ? audioDuration - tracks[index].start : 0;
}

// Decompose the current player position into per-track time values.
// Returns { trackStart, trackEnd, trackDur, trackPos, pct } where pct is 0–100.
// Useful for updating a progress bar that shows only the current track's position.
export function trackProgress(player) {
  const album = player.currentAlbum;
  if (!album) return { trackStart: 0, trackEnd: 0, trackDur: 0, trackPos: 0, pct: 0 };
  const ti = player.currentTrackIndex;
  const trackStart = album.tracks[ti].start;
  const trackEnd = album.tracks[ti + 1]?.start ?? player.duration;
  const trackDur = trackEnd - trackStart;
  const trackPos = player.currentTime - trackStart;
  const pct = trackDur > 0 ? (trackPos / trackDur) * 100 : 0;
  return { trackStart, trackEnd, trackDur, trackPos, pct };
}

// Translate a click (or input change) on a progress bar element into a seek.
// Supports both click events (uses clientX) and input events (uses element.value as 0–100).
// Calls player.seekToTime() with the correct absolute time.
export function seekFromClick(event, barElement, player) {
  const album = player.currentAlbum;
  if (!album) return;
  const ti = player.currentTrackIndex;
  const trackStart = album.tracks[ti].start;
  const trackEnd = album.tracks[ti + 1]?.start ?? player.duration;
  let ratio;
  if (event.type === 'input' || event.type === 'change') {
    ratio = Number.parseFloat(barElement.value) / 100;
  } else {
    const rect = barElement.getBoundingClientRect();
    ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  }
  player.seekToTime(trackStart + ratio * (trackEnd - trackStart));
}

// Bind spacebar (toggle play/pause) and left/right arrow keys (prevTrack/nextTrack).
// Skips INPUT, TEXTAREA, and BUTTON elements so UI controls still work normally.
export function setupKeyboard(player) {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (player.currentAlbum) player.toggle();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      player.prevTrack();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      player.nextTrack();
    }
  });
}
