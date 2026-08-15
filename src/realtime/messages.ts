import type { PublicState } from '@/game/publicState'

export type HostMessage =
  | { type: 'STATE'; state: PublicState }
  | { type: 'BUZZ_ACCEPTED'; playerId: string }

export type PlayerMessage =
  | { type: 'JOIN'; playerId: string; name: string }
  | { type: 'BUZZ'; playerId: string }

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function parsePlayerMessage(raw: unknown): PlayerMessage | null {
  const message = asRecord(raw)
  if (!message || !nonEmptyString(message.playerId)) return null

  if (message.type === 'JOIN' && nonEmptyString(message.name)) {
    return { type: 'JOIN', playerId: message.playerId, name: message.name }
  }
  if (message.type === 'BUZZ') {
    return { type: 'BUZZ', playerId: message.playerId }
  }
  return null
}

export function parseHostMessage(raw: unknown): HostMessage | null {
  const message = asRecord(raw)
  if (!message) return null

  if (message.type === 'STATE' && asRecord(message.state)) {
    return { type: 'STATE', state: message.state as PublicState }
  }
  if (message.type === 'BUZZ_ACCEPTED' && nonEmptyString(message.playerId)) {
    return { type: 'BUZZ_ACCEPTED', playerId: message.playerId }
  }
  return null
}
