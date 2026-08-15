import { describe, expect, test } from 'vitest'
import {
  artistNames,
  buildRecordingQuery,
  chooseYear,
  extractYear,
  primaryArtist,
  stripFeatureCredit,
  toCandidate,
  type MusicBrainzCandidate,
} from '@/songs/musicbrainz'

describe('artistNames', () => {
  test('returns a single-element array for a solo artist', () => {
    expect(artistNames('Tate McRae')).toEqual(['Tate McRae'])
  })

  test('splits a comma-joined credit', () => {
    expect(artistNames('Lady Gaga, Bruno Mars')).toEqual(['Lady Gaga', 'Bruno Mars'])
  })

  test('splits an ampersand-joined credit', () => {
    expect(artistNames('Tinashe & Disco Lines')).toEqual(['Tinashe', 'Disco Lines'])
  })

  test('splits a "with"-joined credit — a real MusicBrainz join phrase', () => {
    expect(artistNames('Kendrick Lamar with SZA')).toEqual(['Kendrick Lamar', 'SZA'])
  })

  test('splits an "x"-joined credit', () => {
    expect(artistNames('Tyla x Wizkid')).toEqual(['Tyla', 'Wizkid'])
  })

  test('splits a "feat." credit into two names', () => {
    expect(artistNames('Darin feat. Eloise')).toEqual(['Darin', 'Eloise'])
  })
})

describe('primaryArtist', () => {
  test('leaves a solo artist untouched', () => {
    expect(primaryArtist('Tate McRae')).toBe('Tate McRae')
  })

  test('keeps only the first name from a comma-joined credit', () => {
    expect(primaryArtist('Lady Gaga, Bruno Mars')).toBe('Lady Gaga')
  })

  test('keeps only the first name from an ampersand-joined credit', () => {
    expect(primaryArtist('Tinashe & Disco Lines')).toBe('Tinashe')
  })

  test('strips a trailing "feat." credit', () => {
    expect(primaryArtist('Darin feat. Eloise')).toBe('Darin')
  })

  test('strips a trailing "ft." credit, case-insensitively', () => {
    expect(primaryArtist('CENTRAL CEE FT. LIL BABY')).toBe('CENTRAL CEE')
  })

  test('keeps only the first name from a "with"-joined credit', () => {
    expect(primaryArtist('Kendrick Lamar with SZA')).toBe('Kendrick Lamar')
  })
})

describe('stripFeatureCredit', () => {
  test('leaves a title with no feature credit untouched', () => {
    expect(stripFeatureCredit('Espresso')).toBe('Espresso')
  })

  test('strips a parenthetical "ft." credit', () => {
    expect(stripFeatureCredit('Raindance (ft. Tems)')).toBe('Raindance')
  })

  test('strips a bare "feat." credit', () => {
    expect(stripFeatureCredit('Cold feat. Post Malone')).toBe('Cold')
  })

  test('strips a bracketed "feat." credit', () => {
    expect(stripFeatureCredit('What I Want (feat. Tate McRae)')).toBe('What I Want')
  })

  test('does not cut into a word that merely contains "feat" or "ft"', () => {
    expect(stripFeatureCredit('Defeat')).toBe('Defeat')
    expect(stripFeatureCredit('wgft')).toBe('wgft')
  })
})

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

  test('queries by the primary artist and a feature-stripped title', () => {
    expect(buildRecordingQuery('Lady Gaga, Bruno Mars', 'Cold feat. Post Malone')).toBe(
      'recording:"Cold" AND artist:"Lady Gaga"',
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

  test('returns 0 for a single matching candidate, however high its score', () => {
    // A lone dated candidate is not corroborated — see MIN_DATED_MATCHES.
    expect(chooseYear([highScore({})], 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })

  test('accepts a match corroborated by a second agreeing candidate', () => {
    const candidates = [highScore({}), highScore({ firstReleaseDate: '1991' })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(1991)
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
    const candidates = [highScore({ artistCredit: 'nirvana' }), highScore({ artistCredit: 'nirvana' })]
    expect(chooseYear(candidates, 'NIRVANA', 'smells like teen spirit')).toBe(1991)
  })

  test('ignores promotional noise in a candidate title, mirroring cleanTitle', () => {
    const candidates = [
      highScore({ title: 'Smells Like Teen Spirit (Remastered 2011)' }),
      highScore({ title: 'Smells Like Teen Spirit [HD]' }),
    ]
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

  test('does not trust a lone dated candidate lost among many undated ones, however high their score', () => {
    // Live, real MusicBrainz data for exactly this query: fourteen score-100
    // "Nirvana" / "Smells Like Teen Spirit" candidates with no
    // first-release-date at all, and exactly one dated 1995 — eight years
    // after the real 1991 release. One data point proves nothing; before
    // MIN_DATED_MATCHES existed this returned 1995 with full confidence.
    const undated = Array.from({ length: 14 }, () => highScore({ firstReleaseDate: undefined }))
    const candidates = [...undated, highScore({ firstReleaseDate: '1995' })]
    expect(chooseYear(candidates, 'Nirvana', 'Smells Like Teen Spirit')).toBe(0)
  })

  test('matches a candidate credited with an "&"-joined pair against a title parsed with "feat."', () => {
    const candidates = [
      { title: 'Cold', artistCredit: 'BigXthaPlug & Post Malone', firstReleaseDate: '2025-11-21', score: 100 },
      { title: 'Cold', artistCredit: 'BigXthaPlug feat. Post Malone', firstReleaseDate: '2025-11-21', score: 100 },
    ]
    expect(chooseYear(candidates, 'BigXthaPlug', 'Cold feat. Post Malone')).toBe(2025)
  })

  // Regression coverage for two confirmed wrong years that reached
  // production before the multi-artist matching rule existed — see
  // chooseYear's docstring for the full story of each.
  describe('multi-performer credit — regression cases', () => {
    test('does not accept a mistagged solo credit for a duet, no matter how high its score', () => {
      // This is exactly the "Lady Gaga, Bruno Mars" / "Die With A Smile"
      // shape: a mistagged solo entry scores 100 (exact match to a
      // primary-artist-only query) while the correct joint credit scores
      // only 83. Score alone must not decide this.
      const candidates = [
        { title: 'Die With a Smile', artistCredit: 'Lady Gaga', firstReleaseDate: '2026-04-18', score: 100 },
        { title: 'Die with a Smile', artistCredit: 'Lady Gaga', firstReleaseDate: '2025-09-01', score: 100 },
      ]
      expect(chooseYear(candidates, 'Lady Gaga, Bruno Mars', 'Die With A Smile')).toBe(0)
    })

    test('accepts a fully co-credited match even at a score below the single-artist bar', () => {
      const candidates = [
        { title: 'Die With a Smile', artistCredit: 'Lady Gaga', firstReleaseDate: '2026-04-18', score: 100 },
        { title: 'Die With a Smile', artistCredit: 'Lady Gaga & Bruno Mars', firstReleaseDate: '2024-08-16', score: 83 },
        { title: 'Die With a Smile', artistCredit: 'Lady Gaga & Bruno Mars', firstReleaseDate: '2024-10-17', score: 83 },
      ]
      expect(chooseYear(candidates, 'Lady Gaga, Bruno Mars', 'Die With A Smile')).toBe(2024)
    })

    test('rejects a candidate that only shares one of the two credited names', () => {
      // "Bad Bunny & Lady Gaga" is a real, unrelated collaboration that
      // also matches on title text; sharing only "Lady Gaga" is not enough.
      const candidates = [
        { title: 'Die With a Smile', artistCredit: 'Bad Bunny & Lady Gaga', firstReleaseDate: '2026-02-08', score: 83 },
        { title: 'Die With a Smile', artistCredit: 'Bad Bunny & Lady Gaga', firstReleaseDate: '2026-02-08', score: 83 },
      ]
      expect(chooseYear(candidates, 'Lady Gaga, Bruno Mars', 'Die With A Smile')).toBe(0)
    })

    test('requires at least two dated candidates even when full-name corroboration passed', () => {
      const candidates = [
        { title: 'Die With a Smile', artistCredit: 'Lady Gaga & Bruno Mars', firstReleaseDate: '2024-08-16', score: 83 },
      ]
      expect(chooseYear(candidates, 'Lady Gaga, Bruno Mars', 'Die With A Smile')).toBe(0)
    })

    test('matches a candidate joined with "with" against a credit parsed with a comma', () => {
      // This is the "Kendrick Lamar, SZA" / "luther" shape: the correct
      // earliest recording is credited "Kendrick Lamar with SZA".
      const candidates = [
        { title: 'luther', artistCredit: 'Kendrick Lamar & SZA', firstReleaseDate: '2025-11-21', score: 100 },
        { title: 'luther', artistCredit: 'Kendrick Lamar with SZA', firstReleaseDate: '2024-11-22', score: 100 },
      ]
      expect(chooseYear(candidates, 'Kendrick Lamar, SZA', 'luther')).toBe(2024)
    })
  })
})
