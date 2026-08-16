import { slugify } from '@/songs/import'

/**
 * Where the deck came from.
 *
 * Every song in `songs.json` was imported from a YouTube playlist, and which
 * one turns out to be the single most useful thing to filter by — it is the
 * one axis of the deck that does not depend on MusicBrainz agreeing to have
 * heard of the song. Year and genre are missing for most of this deck (much
 * of it is Venezuelan rock from the 80s and 90s that MusicBrainz barely
 * catalogues); the playlist a song came from is a fact we control end to end.
 *
 * This file is the registry: it maps each imported playlist to a stable `key`
 * — stored on every song, so a playlist renamed on YouTube does not rewrite
 * `songs.json` — and to the short Spanish `name` the host reads on their
 * phone and the room reads on the television.
 *
 * A playlist imported without an entry here is not an error: the importer
 * slugifies its YouTube title into a key and stamps that instead, and the
 * selector falls back to showing the raw key. Adding it here afterwards is
 * what gives it a name worth reading.
 */
export interface PlaylistOrigin {
  /** Stable id stored on each song and used as the selector's option value. */
  key: string
  /** The YouTube playlist it stands for. */
  playlistId: string
  /**
   * What the host and the room see. Short enough to sit in a chip and still be
   * unmistakable four metres away.
   */
  name: string
}

/**
 * The three playlists this deck was built from.
 *
 * The names are drawn from each playlist's own YouTube title, trimmed to the
 * part that actually distinguishes it:
 *
 * - "Top 100 Songs 2026 - Billboard 2026 - Top 100 & Top Hits" → **Billboard
 *   2026**. The chart is the identity; the rest of that title is padding
 *   repeated by every playlist of its kind.
 * - "Today's Hits - Top Hits 2026 - Top 100 & Hits 2026" → **Éxitos de hoy**,
 *   the Spanish of the only half of that title that is not also in the one
 *   above. The two overlap by 35 songs and would be indistinguishable under
 *   any name built from "Top 100 2026".
 * - "Clásicos rock Made in Venezuela" → **Rock venezolano**. Already Spanish,
 *   already unmistakable; only shortened.
 */
export const PLAYLISTS: readonly PlaylistOrigin[] = [
  {
    key: 'billboard-2026',
    playlistId: 'PLDIoUOhQQPlWc-Kd6TCjTRIl0Z6fSQV0X',
    name: 'Billboard 2026',
  },
  {
    key: 'exitos-de-hoy',
    playlistId: 'PLO7-VO1D0_6MlO4UxJWFBUq3U-7zoIBf7',
    name: 'Éxitos de hoy',
  },
  {
    key: 'rock-venezolano',
    playlistId: 'PLvAqb0FK9NSZb3QATBFjj3FnJnR93Zbgm',
    name: 'Rock venezolano',
  },
] as const

/** The registry's key for a YouTube playlist id, or null when it is not listed. */
export function playlistKeyFor(playlistId: string): string | null {
  return PLAYLISTS.find((playlist) => playlist.playlistId === playlistId)?.key ?? null
}

/**
 * A key for a playlist nobody has named yet.
 *
 * Derived from the playlist's own YouTube title so it is at least readable
 * where it surfaces, and falling back to the playlist id when the title
 * slugifies to nothing (all punctuation, or an empty title) — a key must
 * exist, because "imported but from nowhere" is precisely the state the five
 * pre-import songs are in and no import should ever add to it.
 */
export function playlistKeyFromTitle(title: string, playlistId: string): string {
  return slugify(title) || slugify(playlistId) || playlistId.toLowerCase()
}

/** Key → host-facing name, for the deck selector. Keys absent from it show as themselves. */
export function playlistNames(): Record<string, string> {
  return Object.fromEntries(PLAYLISTS.map((playlist) => [playlist.key, playlist.name]))
}

/**
 * Registry order first, then anything the registry does not know, in
 * alphabetical order. A stable order is what keeps rerunning either script
 * from producing a diff in `songs.json` that says nothing.
 */
function sortKeys(keys: Iterable<string>): string[] {
  const rank = new Map(PLAYLISTS.map((playlist, index) => [playlist.key, index]))
  return [...keys].sort((a, b) => {
    const rankA = rank.get(a) ?? PLAYLISTS.length
    const rankB = rank.get(b) ?? PLAYLISTS.length
    return rankA !== rankB ? rankA - rankB : a.localeCompare(b)
  })
}

/** The song's origins with `key` added, deduplicated and ordered. Used by the importer. */
export function withPlaylistKey(existing: readonly string[] | undefined, key: string): string[] {
  return sortKeys(new Set([...(existing ?? []), key]))
}

/**
 * The song's origins recomputed from scratch against the registry.
 *
 * `containing` is every registered key whose playlist actually holds this
 * video right now, so a song dropped from a playlist loses that origin. Keys
 * the registry does not list are kept untouched: this function has no way to
 * check them, and silently deleting what it cannot verify would quietly
 * destroy the origins of a playlist somebody imported but never named.
 */
export function recomputePlaylistKeys(
  existing: readonly string[] | undefined,
  containing: readonly string[],
): string[] {
  const registered = new Set(PLAYLISTS.map((playlist) => playlist.key))
  const unverifiable = (existing ?? []).filter((key) => !registered.has(key))
  return sortKeys(new Set([...unverifiable, ...containing]))
}
