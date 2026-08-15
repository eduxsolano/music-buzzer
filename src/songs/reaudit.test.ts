import { describe, expect, test } from 'vitest'
import { auditYears } from '@/songs/reaudit'
import type { Song } from '@/game/types'
import type { VerifiedYear } from '@/songs/verified-years'

function song(overrides: Partial<Song>): Song {
  return {
    id: 'song',
    videoId: 'aaaaaaaaaaa',
    title: 'Title',
    artist: 'Artist',
    artists: ['Artist'],
    year: 0,
    startSeconds: 30,
    ...overrides,
  }
}

describe('auditYears', () => {
  test('a verified song keeps its year even when the fresh lookup would have changed it', async () => {
    const songs = [song({ id: 'billie-jean', artist: 'Michael Jackson', year: 1982 })]
    const verified: VerifiedYear[] = [{ id: 'billie-jean', year: 1982, note: 'seed' }]

    const result = await auditYears(songs, verified, async () => 2099)

    expect(songs[0].year).toBe(1982)
    expect(result.disagreements).toEqual([
      { id: 'billie-jean', before: 1982, after: 1982, lookupYear: 2099, restored: false, disagreement: true },
    ])
    // A discarded disagreement is not counted as a coverage change.
    expect(result.corrected).toBe(0)
    expect(result.confirmedUnchanged).toBe(0)
  })

  test('a verified song is restored when its stored year had drifted away from the verified value', async () => {
    // Simulates exactly the incident this file exists to prevent: an
    // out-of-band process already zeroed a protected song before this
    // script got a chance to run.
    const songs = [song({ id: 'billie-jean', artist: 'Michael Jackson', year: 0 })]
    const verified: VerifiedYear[] = [{ id: 'billie-jean', year: 1982, note: 'seed' }]

    const result = await auditYears(songs, verified, async () => 0)

    expect(songs[0].year).toBe(1982)
    expect(result.restored).toBe(1)
    expect(result.disagreements).toEqual([])
  })

  test('a verified song with no disagreement is not reported', async () => {
    const songs = [song({ id: 'billie-jean', artist: 'Michael Jackson', year: 1982 })]
    const verified: VerifiedYear[] = [{ id: 'billie-jean', year: 1982, note: 'seed' }]

    const result = await auditYears(songs, verified, async () => 1982)

    expect(songs[0].year).toBe(1982)
    expect(result.disagreements).toEqual([])
    expect(result.restored).toBe(0)
  })

  test('an unverified song at 0 that the lookup confirms is counted as newly filled', async () => {
    const songs = [song({ id: 'new-song', year: 0 })]

    const result = await auditYears(songs, [], async () => 1999)

    expect(songs[0].year).toBe(1999)
    expect(result.newlyFilled).toBe(1)
  })

  test('an unverified song whose stored year the lookup no longer confirms is reverted to 0 — the exact behaviour that clobbered protected songs before this list existed', async () => {
    const songs = [song({ id: 'shaky-song', year: 2019 })]

    const result = await auditYears(songs, [], async () => 0)

    expect(songs[0].year).toBe(0)
    expect(result.revertedToZero).toBe(1)
  })

  test('an unverified song whose stored year the lookup still confirms is unchanged', async () => {
    const songs = [song({ id: 'stable-song', year: 2010 })]

    const result = await auditYears(songs, [], async () => 2010)

    expect(songs[0].year).toBe(2010)
    expect(result.confirmedUnchanged).toBe(1)
  })

  test('an unverified song whose lookup disagrees with its stored year is corrected', async () => {
    const songs = [song({ id: 'moved-song', year: 2018 })]

    const result = await auditYears(songs, [], async () => 2017)

    expect(songs[0].year).toBe(2017)
    expect(result.corrected).toBe(1)
  })

  test('reports progress for every song, in order', async () => {
    const songs = [song({ id: 'a' }), song({ id: 'b' })]
    const seen: string[] = []

    await auditYears(songs, [], async () => 0, (s, index, total) => {
      seen.push(`${s.id}:${index}/${total}`)
    })

    expect(seen).toEqual(['a:0/2', 'b:1/2'])
  })
})
