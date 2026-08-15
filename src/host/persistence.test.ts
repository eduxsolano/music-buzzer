import { describe, expect, test } from 'vitest'
import { SAVE_VERSION, clearGame, loadGame, saveGame } from '@/host/persistence'
import { initialState, reduce } from '@/game/reducer'

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

describe('host persistence', () => {
  test('an accidental reload does not lose the game', () => {
    const storage = new MemoryStorage()
    let state = reduce(initialState(), { type: 'JOIN', playerId: 'p1', name: 'Ana' })
    state = reduce(state, { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 })
    state = reduce(state, { type: 'BUZZ', playerId: 'p1' })
    state = reduce(state, { type: 'JUDGE', correct: true })

    saveGame(storage, 'KZTR', state)

    expect(loadGame(storage)).toEqual({ room: 'KZTR', state })
  })

  test('returns null when there is nothing saved', () => {
    expect(loadGame(new MemoryStorage())).toBeNull()
  })

  test('returns null instead of throwing on corrupted data', () => {
    const storage = new MemoryStorage()
    storage.setItem('hitster:host', 'not json {{{')
    expect(loadGame(storage)).toBeNull()
  })

  test('clearing wipes the saved game, so a new party starts fresh', () => {
    const storage = new MemoryStorage()
    saveGame(storage, 'KZTR', initialState())
    clearGame(storage)
    expect(loadGame(storage)).toBeNull()
  })

  test('discards a save with no version at all, which is every save from before versioning existed', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'hitster:host',
      JSON.stringify({ room: 'KZTR', state: initialState() }),
    )
    expect(loadGame(storage)).toBeNull()
  })

  test('discards a save whose version does not match the current one', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'hitster:host',
      JSON.stringify({ version: 999, room: 'KZTR', state: initialState() }),
    )
    expect(loadGame(storage)).toBeNull()
  })

  // Regression guard for the production incident: the host crashed on load
  // with `Error: Unknown tier: undefined` from `tierConfig`, because an older
  // build's `buzzed` phase carried `tier` directly instead of the current
  // `worthTier` / `launchTier` / `resumeAtMs` triple. This is the literal
  // payload read out of the deployed browser's localStorage.
  test('regression: never throws on the obsolete buzzed-phase payload that crashed production', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'hitster:host',
      JSON.stringify({
        room: 'KZTR',
        state: {
          players: [{ id: 'p1', name: 'Ana', score: 0 }],
          deck: [],
          currentSongId: 's1',
          roundsPlayed: 1,
          roundsTotal: 20,
          lockedOut: [],
          phase: { kind: 'buzzed', tier: 1, elapsedMs: 1350, playerId: 'p1' },
        },
      }),
    )
    expect(() => loadGame(storage)).not.toThrow()
    expect(loadGame(storage)).toBeNull()
  })

  test('discards a save whose phase is structurally wrong, even under a matching version', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'hitster:host',
      JSON.stringify({
        version: SAVE_VERSION,
        room: 'KZTR',
        state: {
          ...initialState(),
          phase: { kind: 'buzzed', tier: 1, elapsedMs: 1350, playerId: 'p1' },
        },
      }),
    )
    expect(loadGame(storage)).toBeNull()
  })
})
