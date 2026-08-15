/** Letters that survive being read aloud in a noisy room: no I/O/0/1 lookalikes. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

const ROOM_CODE_LENGTH = 4

/**
 * Fisher-Yates-style shuffle. The random source is injected so tests stay
 * deterministic. Each swap partner is drawn from [0, i) rather than [0, i]
 * so that a random source returning its maximum value still reorders.
 */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * i)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function createRoomCode(random: () => number): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)]
  }
  return code
}
