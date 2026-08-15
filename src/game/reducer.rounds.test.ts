import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

function gameWith(deck: string[], roundsTotal: number): GameState {
  const joined = reduce(initialState(), { type: 'JOIN', playerId: 'ana', name: 'Ana' })
  return reduce(joined, { type: 'START_GAME', deck, roundsTotal })
}

describe('advancing rounds', () => {
  test('deals the next song and resets the tier', () => {
    let state = gameWith(['s1', 's2'], 2)
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.currentSongId).toBe('s2')
    expect(state.roundsPlayed).toBe(2)
    expect(state.phase).toEqual({ kind: 'playing', tier: 1, elapsedMs: 0 })
  })

  test('no song is dealt twice in one game', () => {
    let state = gameWith(['s1', 's2', 's3'], 3)
    const dealt: string[] = []
    for (let round = 0; round < 3; round += 1) {
      dealt.push(state.currentSongId as string)
      state = reduce(state, { type: 'SKIP_SONG' })
      state = reduce(state, { type: 'NEXT_ROUND' })
    }
    expect(new Set(dealt).size).toBe(3)
  })

  test('advancing is ignored while the song is still playing', () => {
    const state = gameWith(['s1', 's2'], 2)
    expect(reduce(state, { type: 'NEXT_ROUND' })).toBe(state)
  })
})

describe('finishing', () => {
  test('the game ends once the agreed number of songs has been played', () => {
    let state = gameWith(['s1', 's2'], 1)
    state = reduce(state, { type: 'SKIP_SONG' })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.phase).toEqual({ kind: 'finished' })
  })

  test('the game ends early when the deck runs out', () => {
    let state = gameWith(['s1'], 10)
    state = reduce(state, { type: 'SKIP_SONG' })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.phase).toEqual({ kind: 'finished' })
  })
})

describe('skipping a song', () => {
  test('closes the round with nobody scoring', () => {
    let state = gameWith(['s1', 's2'], 2)
    state = reduce(state, { type: 'SKIP_SONG' })
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'skipped', winnerId: null })
    expect(state.players[0].score).toBe(0)
  })

  test('works while a player is being judged, in case the video is broken', () => {
    let state = gameWith(['s1', 's2'], 2)
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'SKIP_SONG' })
    expect(state.phase).toMatchObject({ kind: 'revealed', outcome: 'skipped' })
  })

  test('is ignored once the song is already revealed', () => {
    let state = gameWith(['s1', 's2'], 2)
    state = reduce(state, { type: 'SKIP_SONG' })
    expect(reduce(state, { type: 'SKIP_SONG' })).toBe(state)
  })
})
