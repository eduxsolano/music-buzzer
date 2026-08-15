/**
 * Pairing the host's phone to the television.
 *
 * The panel exists because the host has to judge before the song is revealed
 * and nothing ever tells them the answer. Putting the answer on the television
 * is impossible — the whole room is looking at it — so it goes to a phone the
 * host holds.
 *
 * That phone cannot listen on the room channel. Every subscriber of
 * `sala:KZTR` receives every message on it, so a title broadcast there lands
 * in each player's browser, one glance at DevTools away. The panel therefore
 * gets **its own channel, named after a secret**: 128 bits minted on the
 * television, handed to the phone by QR, and never published anywhere.
 *
 * What this protects and what it does not:
 *
 * - A player cannot reach the panel by guessing. The room code is four
 *   letters from a 24-letter alphabet (~330k possibilities, and it is printed
 *   on the wall anyway); the panel token is 128 bits from `crypto`, and the
 *   two are unrelated — knowing one says nothing about the other.
 * - The token never crosses the public channel, so no amount of listening on
 *   `sala:KZTR` reveals it.
 * - It does **not** protect against someone photographing the pairing QR
 *   while it is on screen. That is accepted: among friends the boundary is
 *   good faith, not cryptography. The host dismisses the QR once paired, which
 *   is what keeps that window short.
 */

/** Bytes of entropy behind a pairing token. 16 = 128 bits. */
const TOKEN_BYTES = 16

/** Lowercase base32 without padding: URL-safe, and survives being typed. */
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

export type RandomBytes = (length: number) => Uint8Array

/** The browser's CSPRNG, injected so the token generator stays testable. */
export const cryptoRandomBytes: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length))

/**
 * A name nobody can guess.
 *
 * Every byte contributes 8 bits and every output character consumes 5, so the
 * result is 26 characters carrying the full 128 bits (the last character is
 * short two bits of input, which is why the shift is masked rather than
 * assumed).
 */
export function createControlToken(randomBytes: RandomBytes = cryptoRandomBytes): string {
  const bytes = randomBytes(TOKEN_BYTES)
  let bits = 0
  let value = 0
  let token = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      token += TOKEN_ALPHABET[(value >> bits) & 31]
    }
  }
  if (bits > 0) token += TOKEN_ALPHABET[(value << (5 - bits)) & 31]
  return token
}

/** Rejects anything that is not a token this build could have minted. */
export function isControlToken(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false
  return [...value].every((character) => TOKEN_ALPHABET.includes(character))
}

/** Where a player's phone goes. Public: it is on a QR on the television. */
export function joinUrl(origin: string, room: string): string {
  return `${origin}/play?sala=${encodeURIComponent(room)}`
}

/**
 * Where the host's phone goes. The room code is deliberately absent: the panel
 * learns it from the private channel, so this URL carries the secret and
 * nothing else.
 */
export function controlUrl(origin: string, token: string): string {
  return `${origin}/control?t=${encodeURIComponent(token)}`
}
