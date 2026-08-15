import type { Song } from '@/game/types'

const VIDEO_ID_LENGTH = 11

/** MusicBrainz ids are UUIDs; anything else in that field is a typo, not an id. */
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function fail(id: string, field: string, reason: string): never {
  throw new Error(`Song "${id}": ${field} ${reason}`)
}

/** Reads an optional field, distinguishing "absent" from "present and wrong". */
function optionalStrings(value: unknown, id: string, field: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    fail(id, field, 'must be a non-empty array of strings when present')
  }
  if (value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    fail(id, field, 'must contain only non-empty strings')
  }
  return value as string[]
}

function parseSong(raw: unknown, index: number): Song {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Entry ${index} is not an object`)
  }
  const s = raw as Record<string, unknown>
  const id = typeof s.id === 'string' && s.id.length > 0 ? s.id : `#${index}`

  if (typeof s.id !== 'string' || s.id.length === 0) fail(id, 'id', 'must be a non-empty string')
  if (typeof s.videoId !== 'string' || s.videoId.length !== VIDEO_ID_LENGTH) {
    fail(id, 'videoId', `must be a string of ${VIDEO_ID_LENGTH} characters`)
  }
  if (typeof s.title !== 'string' || s.title.length === 0) fail(id, 'title', 'is required')
  if (typeof s.artist !== 'string' || s.artist.length === 0) fail(id, 'artist', 'is required')
  // Required, not optional: a song nobody could match still has one artist —
  // itself. An absent list would make every consumer handle a case that has no
  // meaning, and a filter that silently skips songs is worse than a rough name.
  if (!Array.isArray(s.artists) || s.artists.length === 0) {
    fail(id, 'artists', 'must be a non-empty array')
  }
  if ((s.artists as unknown[]).some((name) => typeof name !== 'string' || name.length === 0)) {
    fail(id, 'artists', 'must contain only non-empty strings')
  }
  if (typeof s.year !== 'number' || !Number.isInteger(s.year)) {
    fail(id, 'year', 'must be an integer')
  }
  if (typeof s.startSeconds !== 'number' || s.startSeconds < 0) {
    fail(id, 'startSeconds', 'must be a number greater than or equal to zero')
  }
  if (s.releaseGroupId !== undefined && (typeof s.releaseGroupId !== 'string' || !MBID.test(s.releaseGroupId))) {
    fail(id, 'releaseGroupId', 'must be a MusicBrainz UUID when present')
  }
  const genres = optionalStrings(s.genres, id, 'genres')
  if (s.cover !== undefined && (typeof s.cover !== 'string' || !s.cover.startsWith('/covers/'))) {
    fail(id, 'cover', 'must be a path under /covers when present')
  }

  return {
    id: s.id as string,
    videoId: s.videoId as string,
    title: s.title as string,
    artist: s.artist as string,
    artists: s.artists as string[],
    year: s.year as number,
    startSeconds: s.startSeconds as number,
    ...(s.releaseGroupId !== undefined ? { releaseGroupId: s.releaseGroupId as string } : {}),
    ...(genres !== undefined ? { genres } : {}),
    ...(s.cover !== undefined ? { cover: s.cover as string } : {}),
  }
}

export function parseSongs(raw: unknown): Song[] {
  if (!Array.isArray(raw)) throw new Error('The song list must be an array')
  const songs = raw.map(parseSong)

  const seenIds = new Set<string>()
  for (const song of songs) {
    if (seenIds.has(song.id)) throw new Error(`Duplicate song id: "${song.id}"`)
    seenIds.add(song.id)
  }

  const seenVideoIds = new Set<string>()
  for (const song of songs) {
    if (seenVideoIds.has(song.videoId)) throw new Error(`Duplicate video id: "${song.videoId}"`)
    seenVideoIds.add(song.videoId)
  }
  return songs
}
