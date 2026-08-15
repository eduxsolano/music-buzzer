import type { GameEvent } from '@/game/types'

/** Spread across the keyboard so elbows do not collide around one laptop. */
export const KEYBOARD_KEYS = ['a', 'g', 'l', 'z', 'm', '0'] as const

export function keyboardPlayerId(key: string): string {
  return `key:${key.toLowerCase()}`
}

/** Keyboard input enters the very same reducer the phones feed. */
export function eventForKey(key: string, registeredKeys: string[]): GameEvent | null {
  const normalised = key.toLowerCase()
  if (!registeredKeys.includes(normalised)) return null
  return { type: 'BUZZ', playerId: keyboardPlayerId(normalised) }
}
