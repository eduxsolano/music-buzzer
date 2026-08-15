import { describe, expect, test } from 'vitest'
import { cleanTitle, playlistIdFromInput, slugify, splitArtistAndTitle } from '@/songs/import'

describe('playlistIdFromInput', () => {
  test('reads the id out of a playlist URL', () => {
    expect(playlistIdFromInput('https://www.youtube.com/playlist?list=PL1234abcd')).toBe(
      'PL1234abcd',
    )
  })

  test('reads the id out of a watch URL that carries a playlist', () => {
    expect(playlistIdFromInput('https://youtube.com/watch?v=abc&list=PLxyz')).toBe('PLxyz')
  })

  test('accepts a bare id', () => {
    expect(playlistIdFromInput('PL1234abcd')).toBe('PL1234abcd')
  })

  test('rejects something that is neither', () => {
    expect(playlistIdFromInput('https://youtube.com/watch?v=abc')).toBeNull()
  })
})

describe('cleanTitle', () => {
  test('strips the usual promotional noise', () => {
    expect(cleanTitle('Smells Like Teen Spirit (Official Music Video)')).toBe(
      'Smells Like Teen Spirit',
    )
    expect(cleanTitle('Billie Jean [4K Remastered]')).toBe('Billie Jean')
    expect(cleanTitle('Rolling in the Deep (Official Audio) [HD]')).toBe('Rolling in the Deep')
  })

  test('keeps parentheses that are part of the actual title', () => {
    expect(cleanTitle("(Don't Fear) The Reaper")).toBe("(Don't Fear) The Reaper")
  })

  test('collapses the whitespace left behind', () => {
    expect(cleanTitle('Song  (Official Video)   ')).toBe('Song')
  })
})

describe('splitArtistAndTitle', () => {
  test('splits on the dash convention', () => {
    expect(splitArtistAndTitle('Nirvana - Smells Like Teen Spirit', 'NirvanaVEVO')).toEqual({
      artist: 'Nirvana',
      title: 'Smells Like Teen Spirit',
    })
  })

  test('falls back to the channel when there is no dash', () => {
    expect(splitArtistAndTitle('Smells Like Teen Spirit', 'Nirvana - Topic')).toEqual({
      artist: 'Nirvana',
      title: 'Smells Like Teen Spirit',
    })
  })

  test('never returns an empty artist, which the schema would reject', () => {
    expect(splitArtistAndTitle('Some Song', '').artist).toBe('Desconocido')
  })

  test('keeps dashes that appear later in the title', () => {
    expect(splitArtistAndTitle('Queen - Bohemian Rhapsody - Live Aid', 'QueenVEVO')).toEqual({
      artist: 'Queen',
      title: 'Bohemian Rhapsody - Live Aid',
    })
  })
})

describe('slugify', () => {
  test('makes a url-safe id', () => {
    expect(slugify('Smells Like Teen Spirit')).toBe('smells-like-teen-spirit')
  })

  test('strips accents, so Spanish titles do not produce mojibake ids', () => {
    expect(slugify('Corazón Partío')).toBe('corazon-partio')
  })

  test('collapses punctuation instead of leaving stray dashes', () => {
    expect(slugify('Despacito ft. Daddy Yankee!')).toBe('despacito-ft-daddy-yankee')
  })
})
