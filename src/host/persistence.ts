import type { GameState } from '@/game/types'

const KEY = 'hitster:host'

export function saveGame(storage: Storage, room: string, state: GameState): void {
  storage.setItem(KEY, JSON.stringify({ room, state }))
}

/** Corrupted or absent data means "no game": never let this crash the host. */
export function loadGame(storage: Storage): { room: string; state: GameState } | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { room?: unknown; state?: unknown }
    if (typeof parsed.room !== 'string' || typeof parsed.state !== 'object' || !parsed.state) {
      return null
    }
    return { room: parsed.room, state: parsed.state as GameState }
  } catch {
    return null
  }
}

export function clearGame(storage: Storage): void {
  storage.removeItem(KEY)
}
