import { describe, expect, test } from 'vitest'
import { DEFAULT_ROUNDS } from '@/game/config'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

function midGame(): GameState {
  let state = reduce(initialState(), { type: 'JOIN', playerId: 'ana', name: 'Ana' })
  state = reduce(state, { type: 'JOIN', playerId: 'beto', name: 'Beto' })
  state = reduce(state, { type: 'START_GAME', deck: ['s1', 's2', 's3'], roundsTotal: 3 })
  state = reduce(state, { type: 'LAUNCH_TIER' })
  state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
  state = reduce(state, { type: 'JUDGE', correct: true })
  return state
}

describe('starting a new session', () => {
  test('zeroes every score but keeps the players', () => {
    const state = reduce(midGame(), { type: 'NEW_SESSION' })
    expect(state.players.map((p) => ({ id: p.id, name: p.name, score: p.score }))).toEqual([
      { id: 'ana', name: 'Ana', score: 0 },
      { id: 'beto', name: 'Beto', score: 0 },
    ])
  })

  test('clears the current song, the deck and the per-song eliminations', () => {
    let state = midGame()
    // Rack up an elimination too, so NEW_SESSION has something to clear there.
    state = reduce(state, { type: 'NEXT_ROUND' })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(state.lockedOut).toEqual(['beto'])

    const reset = reduce(state, { type: 'NEW_SESSION' })
    expect(reset.currentSongId).toBeNull()
    expect(reset.deck).toEqual([])
    expect(reset.lockedOut).toEqual([])
  })

  test('returns the room to the lobby, ready for a fresh START_GAME', () => {
    const reset = reduce(midGame(), { type: 'NEW_SESSION' })
    expect(reset.phase).toEqual({ kind: 'lobby' })
    expect(reset.roundsPlayed).toBe(0)
    expect(reset.roundsTotal).toBe(DEFAULT_ROUNDS)
  })

  test('works from any point in the game, not only after a judgement', () => {
    let state = midGame()
    state = reduce(state, { type: 'NEXT_ROUND' })
    // Mid-tier, with the song actually sounding.
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'TICK', deltaMs: 2_000 })
    const reset = reduce(state, { type: 'NEW_SESSION' })
    expect(reset.phase).toEqual({ kind: 'lobby' })
    expect(reset.currentSongId).toBeNull()
  })

  test('matches the exact shape of a brand-new lobby but for one thing: the players stay', () => {
    const reset = reduce(midGame(), { type: 'NEW_SESSION' })
    const fresh = initialState()
    expect({ ...reset, players: [] }).toEqual(fresh)
  })

  test('negative scores go back to zero too, not just positive ones', () => {
    let state = midGame()
    state = reduce(state, { type: 'NEXT_ROUND' })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(state.players.find((p) => p.id === 'beto')?.score).toBe(-1)

    const reset = reduce(state, { type: 'NEW_SESSION' })
    expect(reset.players.find((p) => p.id === 'beto')?.score).toBe(0)
  })
})
