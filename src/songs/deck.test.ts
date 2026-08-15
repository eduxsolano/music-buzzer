/**
 * The checks that are about the deck actually in the repository, rather than
 * about the shape a deck may take.
 *
 * `check-songs` covers the half that needs the network (does the video still
 * exist, is it long enough); this covers the half that does not, so a broken
 * reference is caught by `npm test` instead of by a black rectangle on the
 * television in front of everybody.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseSongs } from '@/songs/schema'
import { coverPath } from '@/songs/enrich'
import type { Song } from '@/game/types'

const root = path.resolve(import.meta.dirname, '../..')
const songs: Song[] = parseSongs(JSON.parse(readFileSync(path.join(root, 'src/songs/songs.json'), 'utf8')))

describe('the deck in the repository', () => {
  test('parses', () => {
    expect(songs.length).toBeGreaterThan(0)
  })

  test('every song has at least one artist to filter it by', () => {
    for (const song of songs) expect(song.artists.length).toBeGreaterThan(0)
  })

  test('every cover it claims is really on disk and is not empty', () => {
    for (const song of songs) {
      if (!song.cover) continue
      expect(song.cover).toBe(coverPath(song.id))
      const file = path.join(root, 'public', song.cover)
      expect(existsSync(file), `falta ${song.cover}`).toBe(true)
      expect(statSync(file).size).toBeGreaterThan(0)
    }
  })

  test('a song with no cover says so by absence rather than by an empty string', () => {
    for (const song of songs) {
      if ('cover' in song) expect(song.cover).toBeTruthy()
    }
  })

  test('genres and cover only ever accompany the id they came from', () => {
    for (const song of songs) {
      if (song.genres || song.cover) expect(song.releaseGroupId).toBeDefined()
    }
  })
})
