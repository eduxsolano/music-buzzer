import { describe, expect, test } from 'vitest'
import { clearGame, loadGame, saveGame } from '@/host/persistence'
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
})
