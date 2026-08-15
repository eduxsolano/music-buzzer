import { describe, expect, test } from 'vitest'
import {
  cleanTitle,
  playlistIdFromInput,
  slugify,
  splitArtistAndTitle,
  stripTrailingArtistSelfReference,
} from '@/songs/import'

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

  test('keeps a parenthetical whose words merely contain a keyword as a substring', () => {
    expect(cleanTitle('Song (Happy Birthday Mix)')).toBe('Song (Happy Birthday Mix)')
  })

  test('strips a trailing dash- or pipe-delimited "Official Video/Audio/MV" segment', () => {
    expect(cleanTitle('Dividido - Official Lyric Video')).toBe('Dividido')
    expect(cleanTitle('“Free” | Official Lyric Video')).toBe('Free')
    expect(cleanTitle('Song | Official MV')).toBe('Song')
  })

  test('strips the Spanish "VideoClip Oficial" upload convention, with or without a quality tag', () => {
    expect(cleanTitle('PREMISA ALIENACION - VideoClip Oficial HD')).toBe('PREMISA ALIENACION')
    expect(cleanTitle('Song - VideoClip Oficial')).toBe('Song')
  })

  test('strips the double-piped "|| Full Album ||" upload label, keeping a meaningful year alongside it', () => {
    expect(cleanTitle('Miércoles Insólitos (1998) || Full Album ||')).toBe('Miércoles Insólitos (1998)')
  })

  test('strips a bare trailing quality tag with no bracket or delimiter at all', () => {
    expect(cleanTitle('Ni Una Sola Palabra (Totalmente En Vivo con Jay Leno) HQ')).toBe(
      'Ni Una Sola Palabra (Totalmente En Vivo con Jay Leno)',
    )
    expect(cleanTitle('Rock Crepuscular HD 720p')).toBe('Rock Crepuscular')
  })

  test('strips a bare trailing "Visualizer" or "Performance Video" label', () => {
    expect(cleanTitle('“Internet Girl” Visualizer')).toBe('Internet Girl')
    expect(cleanTitle('“Gabriela” Performance Video')).toBe('Gabriela')
  })

  test('unwraps a title that is quoted from end to end once the noise around it is gone', () => {
    expect(cleanTitle('" SIN MIEDO "')).toBe('SIN MIEDO')
  })

  test('does not touch a quote that is only part of the title, not the whole of it', () => {
    expect(cleanTitle('Sweet Home "Alabama"')).toBe('Sweet Home "Alabama"')
  })

  test('does not strip "hd"/"video" when the surrounding word is not the keyword itself', () => {
    expect(cleanTitle('Song - Videodrome')).toBe('Song - Videodrome')
    expect(cleanTitle('A Handy Guide')).toBe('A Handy Guide')
  })

  test('leaves a dash-delimited segment alone when it is not one of the known promo phrases', () => {
    expect(cleanTitle('Queen - Bohemian Rhapsody - Live Aid')).toBe('Queen - Bohemian Rhapsody - Live Aid')
  })
})

describe('stripTrailingArtistSelfReference', () => {
  test('drops a trailing pipe- or dash-delimited repeat of the artist field', () => {
    expect(stripTrailingArtistSelfReference('MOVE | Lil Don Young Boss', 'Lil Don Young Boss')).toBe('MOVE')
    expect(stripTrailingArtistSelfReference('Song - Nirvana', 'Nirvana')).toBe('Song')
  })

  test('is case-insensitive but requires an exact name match', () => {
    expect(stripTrailingArtistSelfReference('Song | nirvana', 'Nirvana')).toBe('Song')
    expect(stripTrailingArtistSelfReference('Song | Nirvana Cover Band', 'Nirvana')).toBe(
      'Song | Nirvana Cover Band',
    )
  })

  test('never empties the title, even when it is nothing but the artist name', () => {
    expect(stripTrailingArtistSelfReference('Nirvana', 'Nirvana')).toBe('Nirvana')
  })

  test('leaves a title with no trailing self-reference untouched', () => {
    expect(stripTrailingArtistSelfReference('Smells Like Teen Spirit', 'Nirvana')).toBe(
      'Smells Like Teen Spirit',
    )
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

  // Regression coverage for stripTrailingArtistSelfReference actually being
  // wired into the import path, not just unit-tested in isolation — a
  // playlist import is the only caller that knows the artist and the raw
  // title at the same time, which is exactly what this convention needs.
  test('strips a trailing self-reference to the channel-derived artist, then mops up the noise it exposes', () => {
    expect(splitArtistAndTitle('“Internet Girl” Visualizer | KATSEYE', 'KATSEYE')).toEqual({
      artist: 'KATSEYE',
      title: 'Internet Girl',
    })
  })

  test('strips a trailing self-reference to the dash-derived artist too', () => {
    expect(splitArtistAndTitle('Nirvana - Smells Like Teen Spirit - Nirvana', 'NirvanaVEVO')).toEqual({
      artist: 'Nirvana',
      title: 'Smells Like Teen Spirit',
    })
  })

  test('does not strip a trailing segment that only resembles the artist', () => {
    expect(splitArtistAndTitle('Song | KATSEYE Fan Cover', 'KATSEYE')).toEqual({
      artist: 'KATSEYE',
      title: 'Song | KATSEYE Fan Cover',
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
