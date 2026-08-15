import { describe, expect, test } from 'vitest'
import { parseSongs } from '@/songs/schema'

const valid = {
  id: 'smells-like-teen-spirit',
  videoId: 'hTWKbfoikeg',
  title: 'Smells Like Teen Spirit',
  artist: 'Nirvana',
  artists: ['Nirvana'],
  year: 1991,
  startSeconds: 42,
}

const enriched = {
  ...valid,
  releaseGroupId: 'd42503ec-54fd-3ac7-83ac-a5e37425509c',
  genres: ['grunge', 'alternative rock'],
  cover: '/covers/smells-like-teen-spirit.jpg',
}

describe('parseSongs', () => {
  test('accepts a well-formed list', () => {
    expect(parseSongs([valid])).toEqual([valid])
  })

  test('rejects a non-array', () => {
    expect(() => parseSongs({})).toThrow(/array/i)
  })

  test('names the offending entry when a field is missing', () => {
    expect(() => parseSongs([{ ...valid, artist: undefined }])).toThrow(
      /smells-like-teen-spirit.*artist/is,
    )
  })

  test('rejects a videoId that is not eleven characters', () => {
    expect(() => parseSongs([{ ...valid, videoId: 'abc' }])).toThrow(/videoId/i)
  })

  test('rejects a negative start point', () => {
    expect(() => parseSongs([{ ...valid, startSeconds: -1 }])).toThrow(/startSeconds/i)
  })

  test('rejects duplicate ids, which would break round tracking', () => {
    expect(() => parseSongs([valid, valid])).toThrow(/duplicate/i)
  })

  test('rejects duplicate video ids even when the song ids differ, which would play the same song twice', () => {
    expect(() =>
      parseSongs([valid, { ...valid, id: 'billie-jean' }]),
    ).toThrow(/duplicate.*hTWKbfoikeg/is)
  })

  test('keeps the MusicBrainz enrichment when a song carries it', () => {
    expect(parseSongs([enriched])).toEqual([enriched])
  })

  test('drops nothing and invents nothing for a song with no enrichment', () => {
    const [song] = parseSongs([valid])
    expect(song.releaseGroupId).toBeUndefined()
    expect(song.genres).toBeUndefined()
    expect(song.cover).toBeUndefined()
  })

  test('requires an artist list, since filtering by artist must never skip a song', () => {
    expect(() => parseSongs([{ ...valid, artists: undefined }])).toThrow(/artists/i)
    expect(() => parseSongs([{ ...valid, artists: [] }])).toThrow(/artists/i)
    expect(() => parseSongs([{ ...valid, artists: ['Nirvana', ''] }])).toThrow(/artists/i)
  })

  test('rejects a release group id that is not a MusicBrainz UUID', () => {
    expect(() => parseSongs([{ ...enriched, releaseGroupId: 'billie-jean' }])).toThrow(
      /releaseGroupId/i,
    )
  })

  test('rejects a cover pointing anywhere but the downloaded covers', () => {
    expect(() =>
      parseSongs([{ ...enriched, cover: 'https://coverartarchive.org/whatever.jpg' }]),
    ).toThrow(/cover/i)
  })

  test('rejects an empty genre list rather than storing "we looked and found none" twice', () => {
    expect(() => parseSongs([{ ...enriched, genres: [] }])).toThrow(/genres/i)
  })
})
