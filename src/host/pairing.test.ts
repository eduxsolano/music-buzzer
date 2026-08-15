import { describe, expect, it } from 'vitest'
import {
  controlUrl,
  createControlToken,
  isControlToken,
  joinUrl,
  tokenFromHash,
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

  it('rejects characters outside the alphabet', () => {
    expect(isControlToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(false)
    expect(isControlToken('abcdefghijklmnopqrstuvwxy!')).toBe(false)
    expect(isControlToken('abcdefghijklmnopqrstuvwxy0')).toBe(false)
  })

  // A validator for a bearer secret that accepts a range accepts tokens
  // weaker than the ones it issues. Nothing produces a short one today; that
  // is not a reason to leave the door open.
  it('demands the exact length the minter produces, not a range', () => {
    const token = createControlToken(countingBytes)
    expect(isControlToken(token)).toBe(true)
    expect(isControlToken(token.slice(0, 25))).toBe(false)
    expect(isControlToken(token.slice(0, 20))).toBe(false)
    expect(isControlToken(token + 'a')).toBe(false)
  })
})

describe('tokenFromHash', () => {
  it('reads back exactly what controlUrl wrote', () => {
    const token = createControlToken(countingBytes)
    const url = new URL(controlUrl('https://x.app', token))
    expect(tokenFromHash(url.hash)).toBe(token)
  })

  it('tolerates the fragment with or without its hash', () => {
    const token = createControlToken(maxBytes)
    expect(tokenFromHash(`#t=${token}`)).toBe(token)
    expect(tokenFromHash(`t=${token}`)).toBe(token)
  })

  it('refuses anything that is not a token, before it can become a channel name', () => {
    expect(tokenFromHash('')).toBeNull()
    expect(tokenFromHash('#')).toBeNull()
    expect(tokenFromHash('#t=KZTR')).toBeNull()
    expect(tokenFromHash('#sala=KZTR')).toBeNull()
    expect(tokenFromHash('#t=')).toBeNull()
  })
})

describe('urls', () => {
  it('sends players to the room and the panel to the token', () => {
    expect(joinUrl('https://x.app', 'KZTR')).toBe('https://x.app/play?sala=KZTR')
    expect(controlUrl('https://x.app', 'abc23')).toBe('https://x.app/control#t=abc23')
  })

  // A fragment never leaves the browser: no edge access log, no proxy, no
  // Referer header ever sees the secret.
  it('keeps the secret in the fragment, never in the query string', () => {
    const url = new URL(controlUrl('https://x.app', 'abc23'))
    expect(url.search).toBe('')
    expect(url.hash).toBe('#t=abc23')
  })

  it('never leaks the room code into the panel url', () => {
    expect(controlUrl('https://x.app', 'abc23')).not.toContain('sala')
  })
})
