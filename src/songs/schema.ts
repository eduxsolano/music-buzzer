import type { Song } from '@/game/types'

const VIDEO_ID_LENGTH = 11

function fail(id: string, field: string, reason: string): never {
  throw new Error(`Song "${id}": ${field} ${reason}`)
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
  if (typeof s.year !== 'number' || !Number.isInteger(s.year)) {
    fail(id, 'year', 'must be an integer')
  }
  if (typeof s.startSeconds !== 'number' || s.startSeconds < 0) {
    fail(id, 'startSeconds', 'must be a number greater than or equal to zero')
  }

  return {
    id: s.id as string,
    videoId: s.videoId as string,
    title: s.title as string,
    artist: s.artist as string,
    year: s.year as number,
    startSeconds: s.startSeconds as number,
  }
}

export function parseSongs(raw: unknown): Song[] {
  if (!Array.isArray(raw)) throw new Error('The song list must be an array')
  const songs = raw.map(parseSong)

  const seen = new Set<string>()
  for (const song of songs) {
    if (seen.has(song.id)) throw new Error(`Duplicate song id: "${song.id}"`)
    seen.add(song.id)
  }
  return songs
}
