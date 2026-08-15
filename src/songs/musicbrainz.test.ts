import { describe, expect, test } from 'vitest'
import {
  buildRecordingQuery,
  chooseYear,
  extractYear,
  toCandidate,
  type MusicBrainzCandidate,
} from '@/songs/musicbrainz'

describe('buildRecordingQuery', () => {
  test('builds a Lucene query with the title and artist', () => {
    expect(buildRecordingQuery('Nirvana', 'Smells Like Teen Spirit')).toBe(
      'recording:"Smells Like Teen Spirit" AND artist:"Nirvana"',
    )
  })

  test('escapes Lucene special characters so a stray quote cannot break the query', () => {
    expect(buildRecordingQuery('AC/DC', 'Rock (n\' Roll)')).toBe(
      'recording:"Rock \\(n\' Roll\\)" AND artist:"AC\\/DC"',
    )
  })
})

describe('extractYear', () => {
  test('reads the year out of a full date', () => {
    expect(extractYear('1991-09-10')).toBe(1991)
  })

  test('reads the year out of a year-and-month date', () => {
    expect(extractYear('1991-09')).toBe(1991)
  })

  test('reads a bare year', () => {
    expect(extractYear('1991')).toBe(1991)
  })

  test('returns 0 when there is no date', () => {
    expect(extractYear(undefined)).toBe(0)
  })

  test('returns 0 for an unparseable date', () => {
    expect(extractYear('unknown')).toBe(0)
  })
})

describe('toCandidate', () => {
  test('joins artist-credit parts, including the join phrase between them', () => {
    const candidate = toCandidate({
      title: 'Under Pressure',
      score: 100,
      'first-release-date': '1981-10-26',
      'artist-credit': [{ name: 'Queen', joinphrase: ' & ' }, { name: 'David Bowie' }],
    })
    expect(candidate).toEqual({
      title: 'Under Pressure',
      artistCredit: 'Queen & David Bowie',
      firstReleaseDate: '1981-10-26',
      score: 100,
    })
  })

  test('defaults missing fields instead of throwing', () => {
    expect(toCandidate({})).toEqual({
      title: '',
      artistCredit: '',
      firstReleaseDate: undefined,
      score: 0,
    })
  })
})

describe('chooseYear', () => {
  const highScore = (over: Partial<MusicBrainzCandidate>): MusicBrainzCandidate => ({
    title: 'Smells Like Teen Spirit',
    artistCredit: 'Nirvana',
    firstReleaseDate: '1991-09-10',
    score: 100,
    ...over,
  })

  test('accepts a single confident match', () => {
    expect(chooseYear([highScore({})], 'Nirvana', 'Smells Like Teen Spirit')).toBe(1991)
  })

  test('accepts several matches that agree on the year, e.g. album and single releases', () => {
    const candidates = [highScore({ firstReleaseDate: '1991-09-10' }), highScore({ firstReleaseDate: '1991' })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(1991)
  })

  test('takes the earliest year when matches are different recordings of the same song', () => {
    // A radio single, a deluxe reissue and a live version commonly carry
    // their own release dates a few months or a couple of years apart in
    // MusicBrainz, which is exactly what real search results look like.
    const candidates = [
      highScore({ firstReleaseDate: '1991-09-10' }),
      highScore({ firstReleaseDate: '1992-01-11' }),
      highScore({ firstReleaseDate: '1993-06-02' }),
    ]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(1991)
  })

  test('returns 0 when matches span too many years to trust as the same work', () => {
    const candidates = [
      highScore({ firstReleaseDate: '1965-01-01' }),
      highScore({ firstReleaseDate: '2015-01-01' }),
    ]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })

  test('is case- and accent-insensitive', () => {
    const candidates = [highScore({ artistCredit: 'nirvana' })]
    expect(chooseYear(candidates, 'NIRVANA', 'smells like teen spirit')).toBe(1991)
  })

  test('ignores promotional noise in a candidate title, mirroring cleanTitle', () => {
    const candidates = [highScore({ title: 'Smells Like Teen Spirit (Remastered 2011)' })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(1991)
  })

  test('returns 0 when there are no candidates', () => {
    expect(chooseYear([], 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })

  test('returns 0 when no candidate matches the artist', () => {
    const candidates = [highScore({ artistCredit: 'Someone Else' })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })

  test('returns 0 when no candidate matches the title', () => {
    const candidates = [highScore({ title: 'A Completely Different Song' })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })

  test('returns 0 when matching candidates disagree on the year', () => {
    const candidates = [highScore({ firstReleaseDate: '1991-09-10' }), highScore({ firstReleaseDate: '2009-01-01' })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })

  test('ignores a low-relevance candidate even if the text matches', () => {
    const candidates = [highScore({ score: 40 })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })

  test('returns 0 when a matching candidate has no release date', () => {
    const candidates = [highScore({ firstReleaseDate: undefined })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })
})
