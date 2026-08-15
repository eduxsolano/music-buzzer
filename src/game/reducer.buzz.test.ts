import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

/** A game with tier 1 already sounding: every round now starts held by the host. */
function gameWith(names: string[]): GameState {
  const joined = names.reduce(
    (state, name) => reduce(state, { type: 'JOIN', playerId: name, name }),
    initialState(),
  )
  const dealt = reduce(joined, { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 })
  return reduce(dealt, { type: 'LAUNCH_TIER' })
}

function scoreOf(state: GameState, id: string): number {
  const player = state.players.find((p) => p.id === id)
  if (!player) throw new Error(`No player ${id}`)
  return player.score
}

describe('buzzing', () => {
  test('freezes what the press is worth and where the music was cut', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 4_999 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    expect(state.phase).toEqual({
      kind: 'buzzed',
      playerId: 'ana',
      worthTier: 1,
      launchTier: 1,
      resumeAtMs: 4_999,
    })
  })

  test('a press during the pause between tiers earns the tier that just played', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    expect(state.phase).toMatchObject({ kind: 'waiting', worthTier: 1, launchTier: 2 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    expect(state.phase).toEqual({
      kind: 'buzzed',
      playerId: 'ana',
      worthTier: 1,
      launchTier: 2,
      resumeAtMs: 0,
    })
  })

  test('a press in the lobby does nothing', () => {
    const lobby = reduce(initialState(), { type: 'JOIN', playerId: 'ana', name: 'ana' })
    expect(reduce(lobby, { type: 'BUZZ', playerId: 'ana' })).toBe(lobby)
  })

  test('two near-simultaneous presses produce exactly one winner', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    expect(state.phase).toMatchObject({ kind: 'buzzed', playerId: 'ana' })
  })

  test('a press from an unknown player does nothing', () => {
    const state = gameWith(['ana'])
    expect(reduce(state, { type: 'BUZZ', playerId: 'ghost' })).toBe(state)
  })

  test('a press from an eliminated player does nothing', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(reduce(state, { type: 'BUZZ', playerId: 'ana' })).toBe(state)
  })

  test('a press while the song is revealed does nothing', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(reduce(state, { type: 'BUZZ', playerId: 'ana' })).toBe(state)
  })
})

describe('judging a correct answer', () => {
  test('awards the frozen tier value, however late the judgement arrives', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 4_999 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'TICK', deltaMs: 60_000 }) // the host takes their time
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(5)
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'correct', winnerId: 'ana' })
  })

  test('pressing just past the boundary is worth the next tier down', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' }) // tier 2 sounding, 0 ms in
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(3)
  })

  test('the third tier is worth two points', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'TICK', deltaMs: 10_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(2)
  })
})

describe('judging a wrong answer', () => {
  test('costs one point and eliminates only that player from this song', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(scoreOf(state, 'ana')).toBe(-1)
    expect(scoreOf(state, 'beto')).toBe(0)
    expect(state.lockedOut).toEqual(['ana'])
  })

  test('scores may go negative', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'NEXT_ROUND' })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(scoreOf(state, 'ana')).toBe(-2)
  })

  test('the audio resumes at the exact cut point, in the same tier', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'TICK', deltaMs: 3_000 }) // tier 2, 3 s in
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    // The room goes quiet and the host decides when the music comes back —
    // but it comes back on the very tier that was cut, at the very
    // millisecond it was cut, and it is still worth that tier.
    expect(state.phase).toEqual({
      kind: 'waiting',
      worthTier: 2,
      launchTier: 2,
      resumeAtMs: 3_000,
    })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    expect(state.phase).toEqual({ kind: 'playing', tier: 2, elapsedMs: 3_000 })
  })

  test('a press during the pause after a wrong answer keeps that tier, cut point and all', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'TICK', deltaMs: 3_000 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    expect(state.phase).toEqual({
      kind: 'buzzed',
      playerId: 'beto',
      worthTier: 2,
      launchTier: 2,
      resumeAtMs: 3_000,
    })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'beto')).toBe(3)
  })

  test('an eliminated player is available again on the next song', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.lockedOut).toEqual([])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    expect(state.phase).toMatchObject({ kind: 'buzzed', playerId: 'ana' })
  })

  test('when everybody is eliminated the round closes with nobody scoring', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'allWrong', winnerId: null })
  })

  test('a judgement with nobody buzzed does nothing', () => {
    const state = gameWith(['ana'])
    expect(reduce(state, { type: 'JUDGE', correct: true })).toBe(state)
  })
})
