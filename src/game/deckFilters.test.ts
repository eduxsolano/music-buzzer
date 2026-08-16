import { describe, expect, test } from 'vitest'
import {
  deckLabel,
  filterSongs,
  isOfferableSelection,
  offerableDeckAxes,
  optionLabel,
  WHOLE_DECK_LABEL,
  type DeckSelection,
} from '@/game/deckFilters'
import type { Song } from '@/game/types'

const NAMES = { 'billboard-2026': 'Billboard 2026', 'rock-venezolano': 'Rock venezolano' }

let counter = 0

/**
 * Every default is deliberately unique — a distinct artist per song — so a
 * test that says nothing about the artist axis really is saying nothing about
 * it, instead of accidentally handing every song the same performer and
 * qualifying an axis it never meant to mention.
 */
function song(overrides: Partial<Song> = {}): Song {
  counter += 1
  return {
    id: `song-${counter}`,
    videoId: `v${String(counter).padStart(10, '0')}`,
    title: `Canción ${counter}`,
    artist: `Artista ${counter}`,
    artists: [`Artista ${counter}`],
    year: 0,
    startSeconds: 30,
    ...overrides,
  }
}

/** `count` songs that all share whatever `overrides` says. */
function many(count: number, overrides: Partial<Song> = {}): Song[] {
  return Array.from({ length: count }, () => song(overrides))
}

describe('offerableDeckAxes', () => {
  test('offers an option that holds exactly a full game', () => {
    const songs = [...many(20, { playlists: ['billboard-2026'] }), ...many(5)]
    const axes = offerableDeckAxes(songs, 20, NAMES)
    expect(axes).toEqual([
      {
        id: 'playlist',
        label: 'Listas',
        options: [
          { axis: 'playlist', value: 'billboard-2026', label: 'Billboard 2026', count: 20 },
        ],
      },
    ])
  })

  test('drops an option one song short of a full game', () => {
    const songs = [...many(19, { playlists: ['billboard-2026'] }), ...many(30)]
    expect(offerableDeckAxes(songs, 20, NAMES)).toEqual([])
  })

  test('an axis with no qualifying option does not appear at all', () => {
    // Plenty of genres, none of them big enough: the genre axis is absent
    // rather than present and empty.
    const songs = [
      ...many(20, { playlists: ['billboard-2026'], genres: ['pop'] }),
      ...many(20, { playlists: ['billboard-2026'], genres: ['rock'] }),
    ]
    const axes = offerableDeckAxes(songs, 30, NAMES)
    expect(axes.map((axis) => axis.id)).toEqual(['playlist'])
  })

  test('a song in two playlists counts for both', () => {
    const songs = many(20, { playlists: ['billboard-2026', 'rock-venezolano'] })
    const counts = offerableDeckAxes(songs, 20, NAMES)[0].options.map((o) => [o.value, o.count])
    expect(counts).toEqual([
      ['billboard-2026', 20],
      ['rock-venezolano', 20],
    ])
  })

  test('a value repeated on one song counts once, so counts match filterSongs', () => {
    const songs = many(20, { genres: ['pop', 'pop'] })
    const option = offerableDeckAxes(songs, 20, NAMES)[0].options[0]
    expect(option.count).toBe(20)
    expect(filterSongs(songs, { axis: 'genre', value: 'pop' })).toHaveLength(option.count)
  })

  test('a year of 0 means unknown and names no decade', () => {
    const songs = many(40, { year: 0 })
    expect(offerableDeckAxes(songs, 20, NAMES).map((axis) => axis.id)).not.toContain('decade')
  })

  test('decades are the ten-year bucket the year falls in', () => {
    const songs = [...many(10, { year: 1991 }), ...many(10, { year: 1999 }), ...many(20, { year: 2024 })]
    const decade = offerableDeckAxes(songs, 20, NAMES).find((axis) => axis.id === 'decade')
    expect(decade?.options).toEqual([
      { axis: 'decade', value: '1990', label: 'Años 1990', count: 20 },
      { axis: 'decade', value: '2020', label: 'Años 2020', count: 20 },
    ])
  })

  test('a collaboration counts for every performer named in it', () => {
    const songs = many(20, { artist: 'A & B', artists: ['A', 'B'] })
    const artists = offerableDeckAxes(songs, 20, NAMES).find((axis) => axis.id === 'artist')
    expect(artists?.options.map((o) => o.value)).toEqual(['A', 'B'])
  })

  test('options come biggest first, ties broken alphabetically', () => {
    const songs = [
      ...many(30, { genres: ['rock'] }),
      ...many(20, { genres: ['pop'] }),
      ...many(20, { genres: ['cumbia'] }),
    ]
    const genres = offerableDeckAxes(songs, 20, NAMES).find((axis) => axis.id === 'genre')
    expect(genres?.options.map((o) => o.label)).toEqual(['Rock', 'Cumbia', 'Pop'])
  })

  test('axes come in a fixed order, playlist first', () => {
    const songs = many(20, {
      playlists: ['billboard-2026'],
      genres: ['pop'],
      year: 2024,
      artists: ['A'],
    })
    expect(offerableDeckAxes(songs, 20, NAMES).map((axis) => axis.id)).toEqual([
      'playlist',
      'decade',
      'genre',
      'artist',
    ])
  })

  test('a playlist key the registry does not name shows as itself', () => {
    const songs = many(20, { playlists: ['una-lista-sin-nombre'] })
    expect(offerableDeckAxes(songs, 20, NAMES)[0].options[0].label).toBe('una-lista-sin-nombre')
  })

  test('an empty deck offers nothing at all', () => {
    expect(offerableDeckAxes([], 20, NAMES)).toEqual([])
  })

  test('is pure: the same songs give the same answer twice', () => {
    const songs = [...many(20, { playlists: ['billboard-2026'] }), ...many(25, { year: 2024 })]
    expect(offerableDeckAxes(songs, 20, NAMES)).toEqual(offerableDeckAxes(songs, 20, NAMES))
  })
})

describe('filterSongs', () => {
  test('null is the whole deck, in its own order', () => {
    const songs = many(5)
    expect(filterSongs(songs, null)).toEqual(songs)
  })

  test('keeps only the songs carrying the value', () => {
    const inside = many(3, { playlists: ['billboard-2026'] })
    const outside = many(3, { playlists: ['rock-venezolano'] })
    expect(filterSongs([...inside, ...outside], { axis: 'playlist', value: 'billboard-2026' })).toEqual(
      inside,
    )
  })

  test('a song with no value on the axis is never kept', () => {
    const songs = many(3)
    expect(filterSongs(songs, { axis: 'playlist', value: 'billboard-2026' })).toEqual([])
  })

  test('every offered option really deals at least a full game', () => {
    const songs = [
      ...many(25, { playlists: ['billboard-2026'], year: 2024, genres: ['pop'] }),
      ...many(30, { playlists: ['rock-venezolano'], year: 1994, artists: ['Zapato 3'] }),
      ...many(7),
    ]
    for (const axis of offerableDeckAxes(songs, 20, NAMES)) {
      for (const option of axis.options) {
        const filtered = filterSongs(songs, { axis: option.axis, value: option.value })
        expect(filtered.length).toBe(option.count)
        expect(filtered.length).toBeGreaterThanOrEqual(20)
      }
    }
  })
})

describe('isOfferableSelection', () => {
  const songs = many(20, { playlists: ['billboard-2026'] })
  const axes = offerableDeckAxes(songs, 20, NAMES)

  test('the whole deck is always offerable', () => {
    expect(isOfferableSelection(axes, null)).toBe(true)
    expect(isOfferableSelection([], null)).toBe(true)
  })

  test('an offered option is offerable', () => {
    expect(isOfferableSelection(axes, { axis: 'playlist', value: 'billboard-2026' })).toBe(true)
  })

  test('a value that qualifies on no axis is refused', () => {
    expect(isOfferableSelection(axes, { axis: 'playlist', value: 'rock-venezolano' })).toBe(false)
  })

  test('the right value on the wrong axis is refused', () => {
    expect(isOfferableSelection(axes, { axis: 'genre', value: 'billboard-2026' })).toBe(false)
  })
})

describe('labels', () => {
  test('no selection is the whole deck', () => {
    expect(deckLabel(null, NAMES)).toBe(WHOLE_DECK_LABEL)
  })

  test('a selection is named by its value', () => {
    const selection: DeckSelection = { axis: 'decade', value: '1990' }
    expect(deckLabel(selection, NAMES)).toBe('Años 1990')
  })

  test('artists and genres are named as they are stored, genres capitalized', () => {
    expect(optionLabel('artist', 'Caramelos de Cianuro', NAMES)).toBe('Caramelos de Cianuro')
    expect(optionLabel('genre', 'dance-pop', NAMES)).toBe('Dance-pop')
  })
})
