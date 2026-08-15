import { describe, expect, test } from 'vitest'
import { KEYBOARD_KEYS, eventForKey, keyFromPlayerId, keyboardPlayerId } from '@/host/keyboardPlayers'

describe('keyboard fallback', () => {
  test('offers keys that are far apart on a physical keyboard', () => {
    expect(KEYBOARD_KEYS).toEqual(['a', 'g', 'l', 'z', 'm', '0'])
  })

  test('maps a key to a stable player id', () => {
    expect(keyboardPlayerId('a')).toBe('key:a')
    expect(keyboardPlayerId('a')).toBe(keyboardPlayerId('a'))
  })

  test('a registered key produces a buzz for its player', () => {
    expect(eventForKey('a', ['a', 'l'])).toEqual({ type: 'BUZZ', playerId: 'key:a' })
  })

  test('an unregistered key does nothing', () => {
    expect(eventForKey('q', ['a', 'l'])).toBeNull()
  })

  test('is case-insensitive, since Caps Lock happens at parties', () => {
    expect(eventForKey('A', ['a'])).toEqual({ type: 'BUZZ', playerId: 'key:a' })
  })
})

describe('keyFromPlayerId', () => {
  test('recovers the key from a keyboard player id', () => {
    expect(keyFromPlayerId('key:a')).toBe('a')
  })

  test('round-trips through keyboardPlayerId', () => {
    expect(keyFromPlayerId(keyboardPlayerId('g'))).toBe('g')
  })

  test('returns null for a phone-issued id', () => {
    expect(keyFromPlayerId('a1b2c3-uuid')).toBeNull()
  })
})
