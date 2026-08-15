import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import { toPublicState } from '@/game/publicState'

function playingGame() {
  const joined = reduce(initialState(), { type: 'JOIN', playerId: 'ana', name: 'Ana' })
  return reduce(joined, {
    type: 'START_GAME',
    deck: ['smells-like-teen-spirit'],
    roundsTotal: 1,
  })
}

describe('toPublicState', () => {
  test('never leaks anything about the current song', () => {
    const serialised = JSON.stringify(toPublicState(playingGame()))
    expect(serialised).not.toContain('smells-like-teen-spirit')
    expect(serialised).not.toContain('deck')
    expect(serialised).not.toContain('currentSongId')
  })

  test('carries the scoreboard so a reconnecting phone catches up', () => {
    expect(toPublicState(playingGame()).players).toEqual([
      { id: 'ana', name: 'Ana', score: 0 },
    ])
  })

  test('reports the phase as a plain string', () => {
    expect(toPublicState(playingGame()).phase).toBe('playing')
  })

  test('names who is being judged so their phone can celebrate', () => {
    const state = reduce(playingGame(), { type: 'BUZZ', playerId: 'ana' })
    const pub = toPublicState(state)
    expect(pub.phase).toBe('buzzed')
    expect(pub.buzzedPlayerId).toBe('ana')
  })

  test('reports who is eliminated from the current song', () => {
    let state = reduce(playingGame(), { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(toPublicState(state).lockedOut).toEqual(['ana'])
  })

  test('reports round progress', () => {
    const pub = toPublicState(playingGame())
    expect(pub.roundsPlayed).toBe(1)
    expect(pub.roundsTotal).toBe(1)
  })
})
