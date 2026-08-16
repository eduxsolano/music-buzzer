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
    outcome: null,
    winnerId: null,
    pointsAtStake: 5,
    tierDurationMs: 5_000,
    remainingMs: 5_000,
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
    expect(buttonState(null, 'p1')).toBe('connecting')
  })

  test('is armed while the song is playing', () => {
    expect(buttonState(stateWith({ phase: 'playing' }), 'p1')).toBe('armed')
  })

  test('stays armed while the host holds the room between tiers', () => {
    // The pause is part of the round: someone who names the song half a
    // second after the music stops still earns the tier that just played.
    // `pointsAtStake` is non-null here (5, from `stateWith`'s default),
    // exactly the way it would be for a real between-tier pause.
    expect(buttonState(stateWith({ phase: 'waiting' }), 'p1')).toBe('armed')
  })

  test('is locked during the round\'s very first wait, before a note has played', () => {
    // The bug this guards against: pressing here used to score tier 1's full
    // 5 points for guessing blind. `pointsAtStake` is null because the
    // reducer would reject the press outright, and the button must not
    // invite a press it is going to ignore.
    expect(
      buttonState(stateWith({ phase: 'waiting', pointsAtStake: null }), 'p1'),
    ).toBe('locked')
  })

  test('celebrates on the phone of the player just judged correct', () => {
    const judged = stateWith({ phase: 'revealed', outcome: 'correct', winnerId: 'p1' })
    expect(buttonState(judged, 'p1')).toBe('celebrating')
    expect(buttonState(judged, 'p2')).toBe('locked')
  })

  test('does not celebrate a reveal nobody won', () => {
    expect(buttonState(stateWith({ phase: 'revealed', outcome: 'timeout' }), 'p1')).toBe('locked')
    expect(buttonState(stateWith({ phase: 'revealed', outcome: 'allWrong' }), 'p1')).toBe('locked')
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

  test('an eliminated player stays out for the whole song, pauses included', () => {
    expect(buttonState(stateWith({ phase: 'waiting', lockedOut: ['p1'] }), 'p1')).toBe('eliminated')
  })

  test('elimination clears when the next song starts', () => {
    expect(buttonState(stateWith({ phase: 'playing', lockedOut: [] }), 'p1')).toBe('armed')
  })
})
