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
import { PLAYLISTS, playlistNames } from '@/songs/playlists'
import { filterSongs, offerableDeckAxes } from '@/game/deckFilters'
import { buildDeck, recordPlayed } from '@/game/deck'
import { DEFAULT_ROUNDS, HISTORY_LIMIT, MIN_DECK_OPTION_SONGS } from '@/game/config'
import type { Song } from '@/game/types'

/** Deterministic stand-in for Math.random. xorshift32; see src/game/deck.test.ts. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state |= 0
    return (state >>> 0) / 0x100000000
  }
}

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

  test('every playlist origin it claims is one the registry knows', () => {
    const known = new Set(PLAYLISTS.map((playlist) => playlist.key))
    for (const song of songs) {
      for (const key of song.playlists ?? []) {
        expect(known.has(key), `${song.id} viene de "${key}", que no está en playlists.ts`).toBe(true)
      }
    }
  })

  test('a song of unknown origin says so by absence rather than by an empty list', () => {
    for (const song of songs) {
      if ('playlists' in song) expect(song.playlists?.length).toBeGreaterThan(0)
    }
  })
})

/**
 * The measurement, kept as a test rather than as a paragraph that goes stale.
 *
 * Nothing here pins a number: the whole design is that the selector starts
 * offering more on its own as the deck's years and artists get curated, so a
 * test asserting "six options" would fail on exactly the improvement it is
 * meant to protect. What it does pin is the property — every option the host
 * is offered can really deal a full game — plus the one axis the project
 * controls end to end, which must never quietly go empty.
 */
describe('what the deck in the repository can offer', () => {
  const axes = offerableDeckAxes(songs, MIN_DECK_OPTION_SONGS, playlistNames())

  test('every offered option holds a full game, and its count is the truth', () => {
    for (const axis of axes) {
      expect(axis.options.length).toBeGreaterThan(0)
      for (const option of axis.options) {
        const filtered = filterSongs(songs, option)
        expect(filtered.length).toBe(option.count)
        expect(filtered.length).toBeGreaterThanOrEqual(MIN_DECK_OPTION_SONGS)
      }
    }
  })

  test('every offered option gives two consecutive games that differ', () => {
    // The promise behind the threshold, checked against the real deck rather
    // than only against the constant: an option the host is offered has to be
    // able to produce a second game, and a sixth, that is not a replay of the
    // first. An option at exactly a game's length cannot, which is why the
    // minimum is two games' worth.
    for (const axis of axes) {
      for (const option of axis.options) {
        const pool = filterSongs(songs, option).map((song) => song.id)
        const random = seededRandom(2026)
        const orders: string[] = []
        let history: string[] = []
        for (let game = 0; game < 6; game += 1) {
          const dealt = buildDeck(pool, history, random).slice(0, DEFAULT_ROUNDS)
          expect(dealt, `${option.label} repartió ${dealt.length}`).toHaveLength(DEFAULT_ROUNDS)
          expect(new Set(dealt).size).toBe(DEFAULT_ROUNDS)
          orders.push(dealt.join(','))
          history = recordPlayed(history, dealt, HISTORY_LIMIT)
        }
        // The second game shares nothing with the first…
        const [one, two] = orders.map((order) => order.split(','))
        expect(two.filter((id) => one.includes(id)), option.label).toEqual([])
        // …and no two of the six are the same running order.
        expect(new Set(orders).size, option.label).toBe(orders.length)
      }
    }
  })

  test('the playlists are offerable, because that is the axis we control', () => {
    const playlists = axes.find((axis) => axis.id === 'playlist')
    expect(playlists?.options.map((option) => option.value).sort()).toEqual(
      PLAYLISTS.map((playlist) => playlist.key).sort(),
    )
  })

  test('the songs of unknown origin still play, as part of the whole deck', () => {
    const orphans = songs.filter((song) => !song.playlists)
    expect(filterSongs(songs, null)).toHaveLength(songs.length)
    for (const orphan of orphans) {
      const inSomeOption = axes
        .filter((axis) => axis.id === 'playlist')
        .some((axis) => axis.options.some((option) => filterSongs([orphan], option).length > 0))
      expect(inSomeOption).toBe(false)
    }
  })
})
