import { describe, expect, test } from 'vitest'
import { parseSongs } from '@/songs/schema'

const valid = {
  id: 'smells-like-teen-spirit',
  videoId: 'hTWKbfoikeg',
  title: 'Smells Like Teen Spirit',
  artist: 'Nirvana',
  year: 1991,
  startSeconds: 42,
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
})
