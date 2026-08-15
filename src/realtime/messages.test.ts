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
    roundsPlayed: 1,
    roundsTotal: 20,
  }

  test('accepts a state broadcast', () => {
    expect(parseHostMessage({ type: 'STATE', state })).toEqual({ type: 'STATE', state })
  })

  test('accepts a buzz acknowledgement', () => {
    expect(parseHostMessage({ type: 'BUZZ_ACCEPTED', playerId: 'p1' })).toEqual({
      type: 'BUZZ_ACCEPTED',
      playerId: 'p1',
    })
  })

  test('rejects garbage instead of throwing', () => {
    expect(parseHostMessage({ type: 'STATE' })).toBeNull()
    expect(parseHostMessage(undefined)).toBeNull()
  })
})
