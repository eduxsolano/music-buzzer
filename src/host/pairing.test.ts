import { describe, expect, it } from 'vitest'
import {
  controlUrl,
  createControlToken,
  isControlToken,
  joinUrl,
  type RandomBytes,
} from '@/host/pairing'

const zeroBytes: RandomBytes = (length) => new Uint8Array(length)
const maxBytes: RandomBytes = (length) => new Uint8Array(length).fill(255)
const countingBytes: RandomBytes = (length) =>
  new Uint8Array(Array.from({ length }, (_, index) => index * 17))

describe('createControlToken', () => {
  it('carries the full 128 bits as 26 characters', () => {
    expect(createControlToken(countingBytes)).toHaveLength(26)
  })

  it('only emits characters from its own alphabet', () => {
    for (const source of [zeroBytes, maxBytes, countingBytes]) {
      expect(createControlToken(source)).toMatch(/^[a-z2-7]+$/)
    }
  })

  it('maps distinct entropy to distinct tokens', () => {
    expect(createControlToken(zeroBytes)).not.toBe(createControlToken(maxBytes))
  })

  it('is a pure function of its byte source', () => {
    expect(createControlToken(countingBytes)).toBe(createControlToken(countingBytes))
  })

  it('does not lose the trailing bits of the last byte', () => {
    // 16 bytes is 128 bits, which is 25 whole 5-bit groups plus 3 bits left
    // over. Dropping them would silently shorten the secret.
    const token = createControlToken(maxBytes)
    expect(token).toHaveLength(26)
    expect(token.at(-1)).not.toBe(createControlToken(zeroBytes).at(-1))
  })

  it('produces different tokens from the real random source', () => {
    expect(createControlToken()).not.toBe(createControlToken())
  })
})

describe('isControlToken', () => {
  it('accepts what the generator produces', () => {
    expect(isControlToken(createControlToken(countingBytes))).toBe(true)
  })

  it('rejects a room code, an empty string and non-strings', () => {
    expect(isControlToken('KZTR')).toBe(false)
    expect(isControlToken('')).toBe(false)
    expect(isControlToken(null)).toBe(false)
    expect(isControlToken(42)).toBe(false)
    expect(isControlToken(undefined)).toBe(false)
  })

  it('rejects characters outside the alphabet, however long', () => {
    expect(isControlToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(false)
    expect(isControlToken('abcdefghijklmnopqrstuvwxy!')).toBe(false)
    expect(isControlToken('abcdefghijklmnopqrstuvwxy0')).toBe(false)
  })
})

describe('urls', () => {
  it('sends players to the room and the panel to the token', () => {
    expect(joinUrl('https://x.app', 'KZTR')).toBe('https://x.app/play?sala=KZTR')
    expect(controlUrl('https://x.app', 'abc23')).toBe('https://x.app/control?t=abc23')
  })

  it('never leaks the room code into the panel url', () => {
    expect(controlUrl('https://x.app', 'abc23')).not.toContain('sala')
  })
})
