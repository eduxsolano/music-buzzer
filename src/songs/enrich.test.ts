import { describe, expect, test } from 'vitest'
import {
  chooseGenres,
  chooseIdentity,
  coverPath,
  toIdentityCandidate,
  type IdentityCandidate,
} from '@/songs/enrich'

function candidate(overrides: Partial<IdentityCandidate> = {}): IdentityCandidate {
  return {
    id: 'd42503ec-54fd-3ac7-83ac-a5e37425509c',
    title: 'Billie Jean',
    artists: ['Michael Jackson'],
    artistCredit: 'Michael Jackson',
    score: 100,
    firstReleaseDate: '1982',
    primaryType: 'Single',
    secondaryTypes: [],
    ...overrides,
  }
}

describe('toIdentityCandidate', () => {
  test('keeps the credit as both a joined display string and a list of names', () => {
    const result = toIdentityCandidate({
      id: 'abc',
      title: 'Die With A Smile',
      score: 83,
      'first-release-date': '2024-08-16',
      'primary-type': 'Single',
      'artist-credit': [
        { name: 'Lady Gaga', joinphrase: ' & ' },
        { name: 'Bruno Mars', joinphrase: '' },
      ],
    })

    expect(result.artistCredit).toBe('Lady Gaga & Bruno Mars')
    expect(result.artists).toEqual(['Lady Gaga', 'Bruno Mars'])
  })

  test('keeps a join phrase MusicBrainz spells as a word', () => {
    const result = toIdentityCandidate({
      'artist-credit': [
        { name: 'Kendrick Lamar', joinphrase: ' with ' },
        { name: 'SZA' },
      ],
    })

    expect(result.artistCredit).toBe('Kendrick Lamar with SZA')
    expect(result.artists).toEqual(['Kendrick Lamar', 'SZA'])
  })

  test('survives a hit with no fields at all rather than throwing', () => {
    const result = toIdentityCandidate({})
    expect(result).toEqual({
      id: '',
      title: '',
      artists: [],
      artistCredit: '',
      score: 0,
      firstReleaseDate: undefined,
      primaryType: undefined,
      secondaryTypes: [],
    })
  })
})

describe('chooseIdentity', () => {
  test('names a song from an exact title and artist match', () => {
    expect(chooseIdentity([candidate()], 'Michael Jackson', 'Billie Jean')).toEqual({
      releaseGroupId: 'd42503ec-54fd-3ac7-83ac-a5e37425509c',
      title: 'Billie Jean',
      artist: 'Michael Jackson',
      artists: ['Michael Jackson'],
    })
  })

  test('returns MusicBrainz’s own capitalisation, not the deck’s', () => {
    const result = chooseIdentity(
      [candidate({ title: 'luther', artists: ['Kendrick Lamar'], artistCredit: 'Kendrick Lamar' })],
      'Kendrick Lamar',
      'Luther',
    )
    expect(result?.title).toBe('luther')
  })

  test('matches a title whose feature credit only the YouTube upload carries', () => {
    const result = chooseIdentity(
      [
        candidate({
          title: 'What I Want',
          artists: ['Morgan Wallen', 'Tate McRae'],
          artistCredit: 'Morgan Wallen feat. Tate McRae',
        }),
      ],
      'Morgan Wallen',
      'What I Want (feat. Tate McRae)',
    )
    expect(result?.title).toBe('What I Want')
    expect(result?.artist).toBe('Morgan Wallen feat. Tate McRae')
  })

  test('matches a collaboration whose join phrase differs from the deck’s', () => {
    const result = chooseIdentity(
      [
        candidate({
          title: 'luther',
          artists: ['Kendrick Lamar', 'SZA'],
          artistCredit: 'Kendrick Lamar with SZA',
        }),
      ],
      'Kendrick Lamar, SZA',
      'luther',
    )
    expect(result?.artist).toBe('Kendrick Lamar with SZA')
    expect(result?.artists).toEqual(['Kendrick Lamar', 'SZA'])
  })

  test('rejects a candidate crediting only one half of a collaboration', () => {
    const result = chooseIdentity(
      [candidate({ title: 'Die With A Smile', artists: ['Lady Gaga'], artistCredit: 'Lady Gaga' })],
      'Lady Gaga, Bruno Mars',
      'Die With A Smile',
    )
    expect(result).toBeNull()
  })

  test('rejects a different song by the same artist', () => {
    expect(chooseIdentity([candidate()], 'Michael Jackson', 'Thriller')).toBeNull()
  })

  test('rejects a cover by a different artist', () => {
    const result = chooseIdentity(
      [candidate({ artists: ['Chris Cornell'], artistCredit: 'Chris Cornell' })],
      'Michael Jackson',
      'Billie Jean',
    )
    expect(result).toBeNull()
  })

  test('rejects an artist whose name merely starts with the one we asked for', () => {
    const result = chooseIdentity(
      [candidate({ artists: ['Michael Jackson Tribute Band'], artistCredit: 'Michael Jackson Tribute Band' })],
      'Michael Jackson',
      'Billie Jean',
    )
    expect(result).toBeNull()
  })

  test('rejects a live album, which is a different thing than the song', () => {
    const result = chooseIdentity(
      [candidate({ primaryType: 'Album', secondaryTypes: ['Live'] })],
      'Michael Jackson',
      'Billie Jean',
    )
    expect(result).toBeNull()
  })

  test('rejects a release group MusicBrainz could not type', () => {
    const result = chooseIdentity(
      [candidate({ primaryType: 'Other', secondaryTypes: [] })],
      'Michael Jackson',
      'Billie Jean',
    )
    expect(result).toBeNull()
  })

  test('rejects a hit below the noise floor', () => {
    expect(chooseIdentity([candidate({ score: 25 })], 'Michael Jackson', 'Billie Jean')).toBeNull()
  })

  test('rejects a hit with no id, since the id is the whole point', () => {
    expect(chooseIdentity([candidate({ id: '' })], 'Michael Jackson', 'Billie Jean')).toBeNull()
  })

  test('returns null rather than guessing when nothing matches', () => {
    expect(chooseIdentity([], 'Michael Jackson', 'Billie Jean')).toBeNull()
  })

  test('refuses to choose between two candidates credited to different acts', () => {
    // Both are vouched for by the deck's own text, so the corroboration rule
    // lets them through; they still disagree about who made the record, and
    // guessing which edition the deck plays is not this function's business.
    const result = chooseIdentity(
      [
        candidate({
          id: '0c3aa1a0-0000-4000-8000-00000000000a',
          title: 'I Had Some Help',
          artists: ['Post Malone'],
          artistCredit: 'Post Malone',
        }),
        candidate({
          id: '0c3aa1a0-0000-4000-8000-00000000000b',
          title: 'I Had Some Help',
          artists: ['Post Malone', 'Morgan Wallen'],
          artistCredit: 'Post Malone feat. Morgan Wallen',
        }),
      ],
      'Post Malone',
      'I Had Some Help (feat. Morgan Wallen)',
    )
    expect(result).toBeNull()
  })

  test('takes the earliest pressing when several editions agree on the act', () => {
    const result = chooseIdentity(
      [
        candidate({ id: 'later', firstReleaseDate: '2001-10-16', primaryType: 'Album' }),
        candidate({ id: 'earlier', firstReleaseDate: '1982-01-02' }),
      ],
      'Michael Jackson',
      'Billie Jean',
    )
    expect(result?.releaseGroupId).toBe('earlier')
  })

  test('prefers a dated edition over an undated one', () => {
    const result = chooseIdentity(
      [
        candidate({ id: 'undated', firstReleaseDate: undefined, score: 100 }),
        candidate({ id: 'dated', firstReleaseDate: '1982', score: 70 }),
      ],
      'Michael Jackson',
      'Billie Jean',
    )
    expect(result?.releaseGroupId).toBe('dated')
  })

  test('breaks a tie the same way every run, so a rerun rewrites nothing', () => {
    const both = [
      candidate({ id: 'bbb', score: 90 }),
      candidate({ id: 'aaa', score: 90 }),
    ]
    expect(chooseIdentity(both, 'Michael Jackson', 'Billie Jean')?.releaseGroupId).toBe('aaa')
    expect(chooseIdentity([...both].reverse(), 'Michael Jackson', 'Billie Jean')?.releaseGroupId).toBe(
      'aaa',
    )
  })

  test('does not mutate the array it was given', () => {
    const candidates = [candidate({ id: 'bbb' }), candidate({ id: 'aaa' })]
    chooseIdentity(candidates, 'Michael Jackson', 'Billie Jean')
    expect(candidates.map((c) => c.id)).toEqual(['bbb', 'aaa'])
  })

  // The three cases below are the real, live MusicBrainz answers for these
  // songs, trimmed to the candidates that survive the clean-type filter. They
  // are indistinguishable from one another in the data — a lone clean release
  // group crediting one artist more than the deck does — which is exactly why
  // all three resolve to null. See everyNameVouchedFor.
  test('refuses a later collaborative single when the deck names only one artist', () => {
    const result = chooseIdentity(
      [
        candidate({
          id: '0c3aa1a0-0000-4000-8000-000000000001',
          title: 'Love Me Not',
          artists: ['Ravyn Lenae', 'Rex Orange County'],
          artistCredit: 'Ravyn Lenae & Rex Orange County',
          score: 81,
          firstReleaseDate: '2024-10-08',
        }),
      ],
      'Ravyn Lenae',
      'Love Me Not',
    )
    expect(result).toBeNull()
  })

  test('refuses it even when every solo release group of that name is a remix', () => {
    const result = chooseIdentity(
      [
        candidate({
          id: '0c3aa1a0-0000-4000-8000-000000000002',
          title: 'The Door',
          artists: ['Teddy Swims', 'Tiago PZK'],
          artistCredit: 'Teddy Swims & Tiago PZK',
          score: 84,
          firstReleaseDate: '2024-06-14',
        }),
        candidate({
          id: '0c3aa1a0-0000-4000-8000-000000000003',
          title: 'The Door (Tiago PZK version)',
          artists: ['Teddy Swims'],
          artistCredit: 'Teddy Swims',
          score: 96,
          firstReleaseDate: '2024-06-14',
          secondaryTypes: ['Remix'],
        }),
      ],
      'Teddy Swims',
      'The Door',
    )
    expect(result).toBeNull()
  })

  test('pays for that rule by refusing a correctly co-credited original too', () => {
    // "Despacito" really is credited "Luis Fonsi ft. Daddy Yankee", and this
    // really is its original single. Nothing in the data tells it apart from
    // the two cases above, so it is given up rather than guessed at.
    const result = chooseIdentity(
      [
        candidate({
          id: '0c3aa1a0-0000-4000-8000-000000000004',
          title: 'Despacito',
          artists: ['Luis Fonsi', 'Daddy Yankee'],
          artistCredit: 'Luis Fonsi ft. Daddy Yankee',
          score: 86,
          firstReleaseDate: '2017-01-13',
        }),
      ],
      'Luis Fonsi',
      'Despacito',
    )
    expect(result).toBeNull()
  })

  test('accepts the extra performer when the deck’s title already named them', () => {
    const result = chooseIdentity(
      [
        candidate({
          title: 'Cold',
          artists: ['BigXthaPlug', 'Post Malone'],
          artistCredit: 'BigXthaPlug feat. Post Malone',
        }),
      ],
      'BigXthaPlug',
      'Cold feat. Post Malone',
    )
    expect(result?.artist).toBe('BigXthaPlug feat. Post Malone')
    expect(result?.artists).toEqual(['BigXthaPlug', 'Post Malone'])
  })

  test('matches through the promotional noise a YouTube title carries', () => {
    const result = chooseIdentity(
      [candidate({ title: 'Animal', artists: ['KATSEYE'], artistCredit: 'KATSEYE' })],
      'KATSEYE',
      'Animal (Official Video)',
    )
    expect(result?.title).toBe('Animal')
  })
})

describe('chooseGenres', () => {
  test('returns the most-voted genres first', () => {
    expect(
      chooseGenres([
        { name: 'disco', count: 1 },
        { name: 'pop', count: 7 },
        { name: 'electronic', count: 2 },
      ]),
    ).toEqual(['pop', 'electronic', 'disco'])
  })

  test('drops a tag nobody voted for', () => {
    expect(chooseGenres([{ name: 'pop', count: 3 }, { name: 'skiffle', count: 0 }])).toEqual(['pop'])
  })

  test('keeps at most three, so a selector gets a description and not a tag cloud', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((name, i) => ({ name, count: 10 - i }))
    expect(chooseGenres(many)).toEqual(['a', 'b', 'c'])
  })

  test('breaks a vote tie alphabetically, so a rerun rewrites nothing', () => {
    expect(chooseGenres([{ name: 'rock', count: 2 }, { name: 'funk', count: 2 }])).toEqual([
      'funk',
      'rock',
    ])
  })

  test('returns nothing when MusicBrainz has no genres at all', () => {
    expect(chooseGenres(undefined)).toEqual([])
    expect(chooseGenres([])).toEqual([])
  })
})

describe('coverPath', () => {
  test('addresses the downloaded file the way the browser asks for it', () => {
    expect(coverPath('billie-jean')).toBe('/covers/billie-jean.jpg')
  })
})
