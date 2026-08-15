import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

function gameWith(names: string[]): GameState {
  const joined = names.reduce(
    (state, name) => reduce(state, { type: 'JOIN', playerId: name, name }),
    initialState(),
  )
  return reduce(joined, { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 })
}

function scoreOf(state: GameState, id: string): number {
  const player = state.players.find((p) => p.id === id)
  if (!player) throw new Error(`No player ${id}`)
  return player.score
}

describe('buzzing', () => {
  test('freezes the tier and the elapsed time at the moment of the press', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 4_999 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    expect(state.phase).toEqual({ kind: 'buzzed', tier: 1, elapsedMs: 4_999, playerId: 'ana' })
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
    state = reduce(state, { type: 'TICK', deltaMs: 60_000 }) // el anfitrión se toma su tiempo
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(5)
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'correct', winnerId: 'ana' })
  })

  test('pressing just past the boundary is worth the next tier down', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 }) // entra al tramo 2
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(3)
  })

  test('the third tier is worth one point', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'TICK', deltaMs: 10_000 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(1)
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
    state = reduce(state, { type: 'TICK', deltaMs: 3_000 }) // tramo 2, 3 s dentro
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(state.phase).toEqual({ kind: 'playing', tier: 2, elapsedMs: 3_000 })
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
