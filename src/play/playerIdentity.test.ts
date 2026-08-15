import { describe, expect, test } from 'vitest'
import { buttonState, loadIdentity, saveName } from '@/play/playerIdentity'
import type { PublicState } from '@/game/publicState'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

function stateWith(overrides: Partial<PublicState>): PublicState {
  return {
    phase: 'playing',
    players: [{ id: 'p1', name: 'Ana', score: 0 }],
    lockedOut: [],
    buzzedPlayerId: null,
    roundsPlayed: 1,
    roundsTotal: 20,
    ...overrides,
  }
}

describe('identity', () => {
  test('mints an id on first use and keeps it afterwards', () => {
    const storage = new MemoryStorage()
    const first = loadIdentity(storage)
    expect(first.playerId).toMatch(/\S/)
    expect(first.name).toBeNull()
    expect(loadIdentity(storage).playerId).toBe(first.playerId)
  })

  test('remembers the name across reloads, so a sleeping phone comes back whole', () => {
    const storage = new MemoryStorage()
    loadIdentity(storage)
    saveName(storage, 'Ana')
    expect(loadIdentity(storage).name).toBe('Ana')
  })
})

describe('buttonState', () => {
  test('waits until the host has sent anything', () => {
    expect(buttonState(null, 'p1')).toBe('waiting')
  })

  test('is armed while the song is playing', () => {
    expect(buttonState(stateWith({ phase: 'playing' }), 'p1')).toBe('armed')
  })

  test('is locked while somebody else is being judged', () => {
    expect(buttonState(stateWith({ phase: 'buzzed', buzzedPlayerId: 'p2' }), 'p1')).toBe('locked')
  })

  test('shows the win state for the player who pressed first', () => {
    expect(buttonState(stateWith({ phase: 'buzzed', buzzedPlayerId: 'p1' }), 'p1')).toBe('won')
  })

  test('does not show the win state for anyone else, even while someone is winning', () => {
    expect(buttonState(stateWith({ phase: 'buzzed', buzzedPlayerId: 'p1' }), 'p2')).toBe('locked')
  })

  test('shows elimination even while the song keeps playing for the others', () => {
    expect(buttonState(stateWith({ phase: 'playing', lockedOut: ['p1'] }), 'p1')).toBe(
      'eliminated',
    )
  })

  test('is locked in the lobby, between songs and at the end', () => {
    expect(buttonState(stateWith({ phase: 'lobby' }), 'p1')).toBe('locked')
    expect(buttonState(stateWith({ phase: 'revealed' }), 'p1')).toBe('locked')
    expect(buttonState(stateWith({ phase: 'finished' }), 'p1')).toBe('locked')
  })

  test('elimination clears when the next song starts', () => {
    expect(buttonState(stateWith({ phase: 'playing', lockedOut: [] }), 'p1')).toBe('armed')
  })
})
