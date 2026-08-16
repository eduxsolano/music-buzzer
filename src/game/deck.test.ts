import { describe, expect, test } from 'vitest'
import { buildDeck, recordPlayed, recordRoundIfDecided } from '@/game/deck'
import { HISTORY_LIMIT } from '@/game/config'
import { initialState } from '@/game/reducer'
import { initialSession, step, undoJudgement } from '@/host/undo'

/** Deterministic stand-in for Math.random, cycling through fixed values. */
function fakeRandom(values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]
}

/** A middling real random source for the multi-game simulation below. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    // xorshift32 — deterministic, decent spread, no dependency on Math.random.
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state |= 0
    // Divide by 2**32 (not 0xffffffff) so the result is always strictly < 1,
    // matching Math.random()'s contract — shuffle() relies on that to stay
    // in bounds.
    return (state >>> 0) / 0x100000000
  }
}

describe('buildDeck', () => {
  test('with no history, every song is fresh: the result is just a shuffle', () => {
    const ids = ['a', 'b', 'c', 'd']
    const result = buildDeck(ids, [], fakeRandom([0.9, 0.1, 0.5, 0.3]))
    expect([...result].sort()).toEqual(ids)
  })

  test('songs not recently played all sort before songs that were', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const result = buildDeck(ids, ['b', 'd'], fakeRandom([0.1, 0.5, 0.9]))
    const freshIndexes = result.map((id, i) => ({ id, i })).filter((x) => x.id === 'a' || x.id === 'c' || x.id === 'e')
    const staleIndexes = result.map((id, i) => ({ id, i })).filter((x) => x.id === 'b' || x.id === 'd')
    expect(Math.max(...freshIndexes.map((x) => x.i))).toBeLessThan(Math.min(...staleIndexes.map((x) => x.i)))
  })

  test('never drops or duplicates a song id', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const result = buildDeck(ids, ['c', 'a'], fakeRandom([0.2, 0.4, 0.6, 0.8]))
    expect([...result].sort()).toEqual([...ids].sort())
  })

  test('when everything is recently played, orders by least- to most-recently played', () => {
    const ids = ['a', 'b', 'c']
    // 'b' played longest ago (index 0), 'c' most recently (index 2).
    const result = buildDeck(ids, ['b', 'a', 'c'], fakeRandom([0.5]))
    expect(result).toEqual(['b', 'a', 'c'])
  })

  test('does not mutate its inputs', () => {
    const ids = ['a', 'b', 'c']
    const history = ['b']
    buildDeck(ids, history, fakeRandom([0.5]))
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(history).toEqual(['b'])
  })
})

describe('recordPlayed', () => {
  test('appends onto the end, oldest first', () => {
    expect(recordPlayed(['a', 'b'], ['c'], 10)).toEqual(['a', 'b', 'c'])
  })

  test('trims from the front once past the limit', () => {
    expect(recordPlayed(['a', 'b', 'c'], ['d'], 3)).toEqual(['b', 'c', 'd'])
  })

  test('a limit of zero keeps no history at all', () => {
    expect(recordPlayed(['a', 'b'], ['c'], 0)).toEqual([])
  })
})

describe('across several consecutive games', () => {
  const DECK_SIZE = 40
  const ROUNDS = 20
  const allIds = Array.from({ length: DECK_SIZE }, (_, i) => `song-${i}`)

  /** Plays one game's worth of songs and returns the ids actually dealt. */
  function playOneGame(history: string[], random: () => number): { dealt: string[]; nextHistory: string[] } {
    const deck = buildDeck(allIds, history, random)
    const dealt = deck.slice(0, Math.min(ROUNDS, deck.length))
    return { dealt, nextHistory: recordPlayed(history, dealt, HISTORY_LIMIT) }
  }

  test('a fresh evening: consecutive games do not repeat songs while fresh ones remain', () => {
    const random = seededRandom(12345)
    let history: string[] = []
    const allDealt: string[][] = []

    // 40 songs, 20 a game: the second game should be entirely disjoint from
    // the first, because 20 fresh songs remain untouched after game one.
    for (let game = 0; game < 2; game += 1) {
      const { dealt, nextHistory } = playOneGame(history, random)
      expect(dealt).toHaveLength(ROUNDS)
      allDealt.push(dealt)
      history = nextHistory
    }

    const [gameOne, gameTwo] = allDealt
    const overlap = gameTwo.filter((id) => gameOne.includes(id))
    expect(overlap).toEqual([])
  })

  test('a long night: once the fresh pool is exhausted, the deck degrades gracefully instead of failing', () => {
    const random = seededRandom(999)
    let history: string[] = []
    const games: string[][] = []

    // 40 songs / 20 per game: game 3 has no fresh songs left at all (games 1
    // and 2 already used all 40, and HISTORY_LIMIT=60 remembers them all).
    for (let game = 0; game < 4; game += 1) {
      const { dealt, nextHistory } = playOneGame(history, random)
      // Every game still deals a FULL game — no crash, no short game, ever.
      expect(dealt).toHaveLength(ROUNDS)
      expect(new Set(dealt).size).toBe(ROUNDS) // no repeat WITHIN a game
      games.push(dealt)
      history = nextHistory
    }

    // Games 1 and 2 together exhaust the entire 40-song deck with no overlap.
    expect(new Set([...games[0], ...games[1]]).size).toBe(DECK_SIZE)
    expect(games[0].filter((id) => games[1].includes(id))).toEqual([])

    // Game 3 has nothing fresh left (everything is in the 60-deep history),
    // so it necessarily reuses songs from games 1/2 — but it still deals a
    // complete, valid game rather than failing or coming up short.
    expect(games[2]).toHaveLength(ROUNDS)
    expect(new Set(games[2]).size).toBe(ROUNDS)
  })

  test('when reusing songs, the least-recently-played ones come back first', () => {
    // A tiny 25-song deck: after game one (20 songs), only 5 are fresh for
    // game two, so 15 of game two's songs must be reused. Those 15 should be
    // the ones from game one that have had the LONGEST time to be forgotten
    // — i.e. specifically the ones NOT still sitting in game one's own dealt
    // order priority — and since game one dealt all 20 non-target ids first,
    // any repeat must come from that pool, never from the tiny fresh pool
    // running out before it's exhausted.
    const smallIds = Array.from({ length: 25 }, (_, i) => `song-${i}`)
    const random = seededRandom(42)

    const gameOneDeck = buildDeck(smallIds, [], random)
    const gameOneDealt = gameOneDeck.slice(0, 20)
    const historyAfterOne = recordPlayed([], gameOneDealt, HISTORY_LIMIT)

    const gameTwoDeck = buildDeck(smallIds, historyAfterOne, random)
    const gameTwoDealt = gameTwoDeck.slice(0, 20)

    const freshForGameTwo = smallIds.filter((id) => !gameOneDealt.includes(id))
    expect(freshForGameTwo).toHaveLength(5)
    // All 5 fresh songs are dealt in game two before any repeat.
    for (const id of freshForGameTwo) {
      expect(gameTwoDealt).toContain(id)
    }
    // The reused ones are ordered by recency: the deck's stale segment (after
    // the 5 shuffled fresh ones) must equal game one's dealt order exactly,
    // since that IS the least-to-most-recently-played order.
    expect(gameTwoDeck.slice(5)).toEqual(gameOneDealt)
  })

  test('HISTORY_LIMIT eventually lets old songs become fresh again', () => {
    // With a 100-song deck and HISTORY_LIMIT = 60, four games' worth of
    // plays (80 songs) push the first game's earliest songs out of the
    // 60-deep memory, so they are fresh again once the fifth game shuffles.
    const bigIds = Array.from({ length: 100 }, (_, i) => `song-${i}`)
    const random = seededRandom(7)
    let history: string[] = []
    let firstGameDealt: string[] = []

    for (let game = 0; game < 5; game += 1) {
      const deck = buildDeck(bigIds, history, random)
      const dealt = deck.slice(0, 20)
      if (game === 0) firstGameDealt = dealt
      history = recordPlayed(history, dealt, HISTORY_LIMIT)
    }

    // History only ever holds the most recent HISTORY_LIMIT songs, so by
    // game 5 (100 songs played across 5 games) at least some of game one's
    // songs have fallen out of the window and are eligible again.
    const stillRemembered = firstGameDealt.filter((id) => history.includes(id))
    expect(stillRemembered.length).toBeLessThan(firstGameDealt.length)
    expect(history.length).toBeLessThanOrEqual(HISTORY_LIMIT)
  })
})

describe('recordRoundIfDecided', () => {
  // Regression: an earlier version of the host's recording effect was keyed
  // on the `revealed` phase object's identity rather than `currentSongId`.
  // Undo-then-rejudge produces two DISTINCT `revealed` objects for the same
  // round (the reducer builds a fresh object literal every time), so that
  // guard recorded the song twice — burning two of HISTORY_LIMIT's slots for
  // one play. This drives the real `reduce`/`step`/`undoJudgement` sequence a
  // mis-tapped ❌ followed by Undo followed by ✅ actually produces, calling
  // `recordRoundIfDecided` exactly where the host's effect would fire —
  // after the wrong judgement, after the undo, and after the right one — and
  // asserts the song lands in history exactly once.
  test('judge wrong, undo, judge right: the song is recorded exactly once', () => {
    let session = initialSession(initialState())
    session = step(session, { type: 'JOIN', playerId: 'ana', name: 'Ana' })
    session = step(session, { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 })
    session = step(session, { type: 'LAUNCH_TIER' })
    session = step(session, { type: 'BUZZ', playerId: 'ana' })

    let history: string[] = []
    let lastRecordedSongId: string | null = null
    let recordedCount = 0

    // The mis-tap: ❌. With one player this immediately closes the round
    // (`allWrong`), which is exactly the case that offers an undo.
    session = step(session, { type: 'JUDGE', correct: false })
    expect(session.game.phase).toMatchObject({ kind: 'revealed', outcome: 'allWrong' })
    let result = recordRoundIfDecided(session.game.phase, session.game.currentSongId, lastRecordedSongId, history, HISTORY_LIMIT)
    if (result.recorded) recordedCount += 1
    ;({ history, lastRecordedSongId } = result)

    // Deshacer: back to the `buzzed` phase from just before the judgement.
    session = undoJudgement(session)
    expect(session.game.phase).toMatchObject({ kind: 'buzzed' })
    result = recordRoundIfDecided(session.game.phase, session.game.currentSongId, lastRecordedSongId, history, HISTORY_LIMIT)
    if (result.recorded) recordedCount += 1
    ;({ history, lastRecordedSongId } = result)

    // The corrected judgement: ✅. A brand-new `revealed` object, same round.
    session = step(session, { type: 'JUDGE', correct: true })
    expect(session.game.phase).toMatchObject({ kind: 'revealed', outcome: 'correct' })
    result = recordRoundIfDecided(session.game.phase, session.game.currentSongId, lastRecordedSongId, history, HISTORY_LIMIT)
    if (result.recorded) recordedCount += 1
    ;({ history, lastRecordedSongId } = result)

    expect(recordedCount).toBe(1)
    expect(history).toEqual(['s1'])
  })
})
