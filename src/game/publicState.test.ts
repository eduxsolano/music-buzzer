import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import { pointsAtStake, toPublicState, withCountdown } from '@/game/publicState'
import type { GameState } from '@/game/types'

function dealtGame(): GameState {
  const joined = reduce(initialState(), { type: 'JOIN', playerId: 'ana', name: 'Ana' })
  return reduce(joined, {
    type: 'START_GAME',
    deck: ['smells-like-teen-spirit'],
    roundsTotal: 1,
  })
}

function playingGame(): GameState {
  return reduce(dealtGame(), { type: 'LAUNCH_TIER' })
}

describe('toPublicState', () => {
  test('never leaks anything about the current song', () => {
    const serialised = JSON.stringify(toPublicState(playingGame()))
    expect(serialised).not.toContain('smells-like-teen-spirit')
    expect(serialised).not.toContain('deck')
    expect(serialised).not.toContain('currentSongId')
  })

  test('carries the scoreboard so a reconnecting phone catches up', () => {
    expect(toPublicState(playingGame()).players).toEqual([{ id: 'ana', name: 'Ana', score: 0 }])
  })

  test('reports the phase as a plain string', () => {
    expect(toPublicState(playingGame()).phase).toBe('playing')
    expect(toPublicState(dealtGame()).phase).toBe('waiting')
  })

  test('names who is being judged so their phone can celebrate', () => {
    const state = reduce(playingGame(), { type: 'BUZZ', playerId: 'ana' })
    const pub = toPublicState(state)
    expect(pub.phase).toBe('buzzed')
    expect(pub.buzzedPlayerId).toBe('ana')
  })

  test('names the round winner and how the round ended', () => {
    let state = reduce(playingGame(), { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    const pub = toPublicState(state)
    expect(pub.outcome).toBe('correct')
    expect(pub.winnerId).toBe('ana')
  })

  test('leaves the outcome empty until the round has actually ended', () => {
    const pub = toPublicState(playingGame())
    expect(pub.outcome).toBeNull()
    expect(pub.winnerId).toBeNull()
  })

  test('a round nobody won names nobody', () => {
    let state = reduce(playingGame(), { type: 'SKIP_SONG' })
    let pub = toPublicState(state)
    expect(pub.outcome).toBe('skipped')
    expect(pub.winnerId).toBeNull()

    state = reduce(playingGame(), { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    pub = toPublicState(state)
    expect(pub.outcome).toBe('allWrong')
    expect(pub.winnerId).toBeNull()
    // "Elimination applies to the current song only" is a frozen rule; this is
    // its direct test at this layer — reports who is eliminated from the
    // current song.
    expect(pub.lockedOut).toEqual(['ana'])
  })

  test('says what a press is worth right now', () => {
    // Freshly dealt: the host has not launched tier 1 yet, so a press right
    // now would be rejected by the reducer — the phone must be told there is
    // nothing to win, not tier 1's value.
    expect(toPublicState(dealtGame()).pointsAtStake).toBeNull()
    expect(toPublicState(playingGame()).pointsAtStake).toBe(5)
    const afterTierOne = reduce(playingGame(), { type: 'TICK', deltaMs: 5_000 })
    expect(toPublicState(afterTierOne).pointsAtStake).toBe(5)
    const tierTwo = reduce(afterTierOne, { type: 'LAUNCH_TIER' })
    expect(toPublicState(tierTwo).pointsAtStake).toBe(3)
  })

  test('sends the tier length the phone scales its ring against', () => {
    expect(toPublicState(playingGame()).tierDurationMs).toBe(5_000)
    const tierTwo = reduce(
      reduce(playingGame(), { type: 'TICK', deltaMs: 5_000 }),
      { type: 'LAUNCH_TIER' },
    )
    expect(toPublicState(tierTwo).tierDurationMs).toBe(10_000)
  })

  test('reports round progress', () => {
    const pub = toPublicState(playingGame())
    expect(pub.roundsPlayed).toBe(1)
    expect(pub.roundsTotal).toBe(1)
  })
})

describe('the countdown never widens the publish window', () => {
  // The host publishes only when this object changes. If a value that moves
  // every 50ms tick lived in it, every tick would become a STATE broadcast and
  // saturate the shared Supabase channel — the bug the throttle in
  // useHostGame.ts exists to prevent.
  test('the compared projection has no countdown in it at all', () => {
    expect(Object.keys(toPublicState(playingGame()))).not.toContain('remainingMs')
  })

  test('ticking a whole tier away never changes the compared projection', () => {
    let state = playingGame()
    const first = JSON.stringify(toPublicState(state))
    for (let i = 0; i < 99; i += 1) {
      state = reduce(state, { type: 'TICK', deltaMs: 50 })
      expect(state.phase).toMatchObject({ kind: 'playing' })
      expect(JSON.stringify(toPublicState(state))).toBe(first)
    }
  })

  test('the countdown is attached at send time, from the same phase', () => {
    const state = reduce(playingGame(), { type: 'TICK', deltaMs: 2_000 })
    const sent = withCountdown(toPublicState(state), state.phase)
    expect(sent.remainingMs).toBe(3_000)
    expect(sent.phase).toBe('playing')
  })

  test('a phase with no tier in play sends no countdown', () => {
    const state = reduce(playingGame(), { type: 'SKIP_SONG' })
    expect(withCountdown(toPublicState(state), state.phase).remainingMs).toBeNull()
  })
})

describe('pointsAtStake', () => {
  test('is the running tier while a song plays', () => {
    expect(pointsAtStake({ kind: 'playing', tier: 1, elapsedMs: 0 })).toBe(5)
    expect(pointsAtStake({ kind: 'playing', tier: 2, elapsedMs: 0 })).toBe(3)
    expect(pointsAtStake({ kind: 'playing', tier: 3, elapsedMs: 0 })).toBe(2)
  })

  test('is the tier just heard while the host holds the room', () => {
    expect(
      pointsAtStake({
        kind: 'waiting',
        worthTier: 2,
        launchTier: 3,
        resumeAtMs: 0,
        heardThisRound: true,
      }),
    ).toBe(3)
  })

  test('is nothing during the round\'s opening wait, before a tier has ever launched', () => {
    expect(
      pointsAtStake({
        kind: 'waiting',
        worthTier: 1,
        launchTier: 1,
        resumeAtMs: 0,
        heardThisRound: false,
      }),
    ).toBeNull()
  })

  test('is frozen at the press while somebody is judged', () => {
    expect(
      pointsAtStake({
        kind: 'buzzed',
        playerId: 'p1',
        worthTier: 1,
        launchTier: 2,
        resumeAtMs: 0,
      }),
    ).toBe(5)
  })

  test('is nothing where a press cannot score', () => {
    expect(pointsAtStake({ kind: 'lobby' })).toBeNull()
    expect(pointsAtStake({ kind: 'revealed', outcome: 'timeout', winnerId: null })).toBeNull()
    expect(pointsAtStake({ kind: 'finished' })).toBeNull()
  })
})
