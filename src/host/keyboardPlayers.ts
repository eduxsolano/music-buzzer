import type { GameEvent } from '@/game/types'

/** Spread across the keyboard so elbows do not collide around one laptop. */
export const KEYBOARD_KEYS = ['a', 'g', 'l', 'z', 'm', '0'] as const

const KEYBOARD_PLAYER_PREFIX = 'key:'

export function keyboardPlayerId(key: string): string {
  return `${KEYBOARD_PLAYER_PREFIX}${key.toLowerCase()}`
}

/**
 * Recovers the key from a player id produced by `keyboardPlayerId`, or null
 * for a phone-issued id. Lets the registered keys be derived from the
 * persisted players list instead of separate, reload-losing local state.
 */
export function keyFromPlayerId(playerId: string): string | null {
  return playerId.startsWith(KEYBOARD_PLAYER_PREFIX)
    ? playerId.slice(KEYBOARD_PLAYER_PREFIX.length)
    : null
}

/** Keyboard input enters the very same reducer the phones feed. */
export function eventForKey(key: string, registeredKeys: string[]): GameEvent | null {
  const normalised = key.toLowerCase()
  if (!registeredKeys.includes(normalised)) return null
  return { type: 'BUZZ', playerId: keyboardPlayerId(normalised) }
}
