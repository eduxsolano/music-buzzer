import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

function withPlayers(...names: string[]): GameState {
  return names.reduce(
    (state, name) => reduce(state, { type: 'JOIN', playerId: name, name }),
    initialState(),
  )
}

describe('joining', () => {
  test('a new player starts at zero points', () => {
    const state = withPlayers('ana')
    expect(state.players).toEqual([{ id: 'ana', name: 'ana', score: 0 }])
  })

  test('rejoining with the same id updates the name instead of duplicating', () => {
    const state = reduce(withPlayers('ana'), { type: 'JOIN', playerId: 'ana', name: 'Ana' })
    expect(state.players).toEqual([{ id: 'ana', name: 'Ana', score: 0 }])
  })

  test('rejoining never resets the score', () => {
    const scored: GameState = {
      ...withPlayers('ana'),
      players: [{ id: 'ana', name: 'ana', score: 7 }],
    }
    const state = reduce(scored, { type: 'JOIN', playerId: 'ana', name: 'Ana' })
    expect(state.players[0].score).toBe(7)
  })
})

describe('starting a game', () => {
  test('deals the first song and hands the room to the host', () => {
    const state = reduce(withPlayers('ana'), {
      type: 'START_GAME',
      deck: ['s1', 's2'],
      roundsTotal: 2,
    })
    expect(state.currentSongId).toBe('s1')
    expect(state.deck).toEqual(['s2'])
    expect(state.roundsPlayed).toBe(1)
    expect(state.phase).toEqual({
      kind: 'waiting',
      worthTier: 1,
      launchTier: 1,
      resumeAtMs: 0,
      heardThisRound: false,
    })
  })

  test('nothing sounds until the host launches the first tier', () => {
    const dealt = reduce(withPlayers('ana'), { type: 'START_GAME', deck: ['s1'], roundsTotal: 1 })
    expect(reduce(dealt, { type: 'TICK', deltaMs: 1_000 })).toBe(dealt)
    const launched = reduce(dealt, { type: 'LAUNCH_TIER' })
    expect(launched.phase).toEqual({ kind: 'playing', tier: 1, elapsedMs: 0 })
  })

  // The bug this guards against: a round is dealt straight into `waiting`,
  // and the BUZZ guard used to accept `waiting` unconditionally — so a
  // player could press before a single note played and walk away with tier
  // 1's full 5 points for guessing blind.
  test('a press before the host has launched a single tier does nothing', () => {
    const dealt = reduce(withPlayers('ana'), { type: 'START_GAME', deck: ['s1'], roundsTotal: 1 })
    expect(dealt.phase).toMatchObject({ kind: 'waiting', heardThisRound: false })
    expect(reduce(dealt, { type: 'BUZZ', playerId: 'ana' })).toBe(dealt)
  })
})

describe('launching a tier', () => {
  test('is ignored unless the host is actually holding the room', () => {
    const lobby = withPlayers('ana')
    expect(reduce(lobby, { type: 'LAUNCH_TIER' })).toBe(lobby)
    const playing = reduce(
      reduce(lobby, { type: 'START_GAME', deck: ['s1'], roundsTotal: 1 }),
      { type: 'LAUNCH_TIER' },
    )
    expect(reduce(playing, { type: 'LAUNCH_TIER' })).toBe(playing)
  })

  test('resumes from the millisecond it was told to, not from the start', () => {
    const state: GameState = {
      ...withPlayers('ana'),
      phase: { kind: 'waiting', worthTier: 2, launchTier: 2, resumeAtMs: 3_400, heardThisRound: true },
    }
    expect(reduce(state, { type: 'LAUNCH_TIER' }).phase).toEqual({
      kind: 'playing',
      tier: 2,
      elapsedMs: 3_400,
    })
  })
})

describe('tier progression', () => {
  function playing(): GameState {
    const dealt = reduce(withPlayers('ana'), {
      type: 'START_GAME',
      deck: ['s1'],
      roundsTotal: 1,
    })
    return reduce(dealt, { type: 'LAUNCH_TIER' })
  }

  test('a tick advances the elapsed time within the tier', () => {
    const state = reduce(playing(), { type: 'TICK', deltaMs: 1_200 })
    expect(state.phase).toEqual({ kind: 'playing', tier: 1, elapsedMs: 1_200 })
  })

  test('running out of a tier waits for the host instead of chaining on', () => {
    const state = reduce(playing(), { type: 'TICK', deltaMs: 5_000 })
    expect(state.phase).toEqual({
      kind: 'waiting',
      worthTier: 1,
      launchTier: 2,
      resumeAtMs: 0,
      heardThisRound: true,
    })
  })

  test('the pause is still worth the tier that just played', () => {
    let state = reduce(playing(), { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(state.players[0].score).toBe(5)
  })

  test('the third tier running out reveals the song with nobody scoring', () => {
    let state = reduce(playing(), { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'TICK', deltaMs: 10_000 })
    expect(state.phase).toEqual({
      kind: 'waiting',
      worthTier: 2,
      launchTier: 3,
      resumeAtMs: 0,
      heardThisRound: true,
    })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    expect(state.phase).toMatchObject({ kind: 'playing', tier: 3 })
    state = reduce(state, { type: 'TICK', deltaMs: 15_000 })
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'timeout', winnerId: null })
    expect(state.players[0].score).toBe(0)
  })

  test('ticks are ignored while nothing is playing', () => {
    const lobby = withPlayers('ana')
    expect(reduce(lobby, { type: 'TICK', deltaMs: 1_000 })).toBe(lobby)
  })
})
