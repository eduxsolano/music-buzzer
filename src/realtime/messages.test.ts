import { describe, expect, test } from 'vitest'
import { parseHostMessage, parsePlayerMessage } from '@/realtime/messages'

describe('parsePlayerMessage', () => {
  test('accepts a join', () => {
    expect(parsePlayerMessage({ type: 'JOIN', playerId: 'p1', name: 'Ana' })).toEqual({
      type: 'JOIN',
      playerId: 'p1',
      name: 'Ana',
    })
  })

  test('accepts a buzz', () => {
    expect(parsePlayerMessage({ type: 'BUZZ', playerId: 'p1' })).toEqual({
      type: 'BUZZ',
      playerId: 'p1',
    })
  })

  test('rejects garbage instead of throwing', () => {
    expect(parsePlayerMessage(null)).toBeNull()
    expect(parsePlayerMessage('BUZZ')).toBeNull()
    expect(parsePlayerMessage({ type: 'BUZZ' })).toBeNull()
    expect(parsePlayerMessage({ type: 'NUKE', playerId: 'p1' })).toBeNull()
  })

  test('rejects a join with an empty name', () => {
    expect(parsePlayerMessage({ type: 'JOIN', playerId: 'p1', name: '' })).toBeNull()
  })
})

describe('parseHostMessage', () => {
  const state = {
    phase: 'playing' as const,
    players: [],
    lockedOut: [],
    buzzedPlayerId: null,
    outcome: null,
    winnerId: null,
    pointsAtStake: 5,
    tierDurationMs: 5_000,
    remainingMs: 5_000,
    roundsPlayed: 1,
    roundsTotal: 20,
  }

  test('accepts a state broadcast', () => {
    expect(parseHostMessage({ type: 'STATE', state })).toEqual({ type: 'STATE', state })
  })

  test('rejects garbage instead of throwing', () => {
    expect(parseHostMessage({ type: 'STATE' })).toBeNull()
    expect(parseHostMessage(undefined)).toBeNull()
  })

  test('accepts a well-formed state with a player and comes back with the right values', () => {
    const fullState = {
      phase: 'buzzed' as const,
      players: [{ id: 'p1', name: 'Ana', score: 3 }],
      lockedOut: ['p2'],
      buzzedPlayerId: 'p1',
      outcome: null,
      winnerId: null,
      pointsAtStake: 3,
      tierDurationMs: 10_000,
      remainingMs: 7_000,
      roundsPlayed: 2,
      roundsTotal: 20,
    }
    expect(parseHostMessage({ type: 'STATE', state: fullState })).toEqual({
      type: 'STATE',
      state: fullState,
    })
  })

  test('accepts the phase the host holds the room in', () => {
    expect(
      parseHostMessage({ type: 'STATE', state: { ...state, phase: 'waiting' } })?.state.phase,
    ).toBe('waiting')
  })

  test('carries the round result through, so a phone knows it was right', () => {
    const revealed = { ...state, phase: 'revealed' as const, outcome: 'correct', winnerId: 'p1' }
    const parsed = parseHostMessage({ type: 'STATE', state: revealed })
    expect(parsed?.state.outcome).toBe('correct')
    expect(parsed?.state.winnerId).toBe('p1')
  })

  test('rejects a state whose outcome is an unknown string', () => {
    expect(
      parseHostMessage({ type: 'STATE', state: { ...state, outcome: 'meh' } }),
    ).toBeNull()
  })

  test('rejects a state whose countdown or stake is not a number', () => {
    expect(
      parseHostMessage({ type: 'STATE', state: { ...state, remainingMs: 'soon' } }),
    ).toBeNull()
    expect(
      parseHostMessage({ type: 'STATE', state: { ...state, pointsAtStake: 'lots' } }),
    ).toBeNull()
  })

  test('rejects a state missing the fields the phone now needs', () => {
    for (const field of [
      'outcome',
      'winnerId',
      'pointsAtStake',
      'tierDurationMs',
      'remainingMs',
    ]) {
      const incomplete: Record<string, unknown> = { ...state }
      delete incomplete[field]
      expect(parseHostMessage({ type: 'STATE', state: incomplete })).toBeNull()
    }
  })

  test('rejects a state that is an array', () => {
    expect(parseHostMessage({ type: 'STATE', state: [] })).toBeNull()
  })

  test('rejects a state missing all its fields', () => {
    expect(parseHostMessage({ type: 'STATE', state: {} })).toBeNull()
  })

  test('rejects a state whose players is not an array', () => {
    expect(
      parseHostMessage({ type: 'STATE', state: { ...state, players: 'nope' } }),
    ).toBeNull()
  })

  test('rejects a state with a player missing score', () => {
    expect(
      parseHostMessage({
        type: 'STATE',
        state: { ...state, players: [{ id: 'p1', name: 'Ana' }] },
      }),
    ).toBeNull()
  })

  test('rejects a state whose phase is an unknown string', () => {
    expect(parseHostMessage({ type: 'STATE', state: { ...state, phase: 'paused' } })).toBeNull()
  })

  test('rejects a state whose lockedOut contains a non-string', () => {
    expect(
      parseHostMessage({ type: 'STATE', state: { ...state, lockedOut: [1] } }),
    ).toBeNull()
  })
})
