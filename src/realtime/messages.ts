import type { PublicState } from '@/game/publicState'

export type HostMessage = { type: 'STATE'; state: PublicState }

export type PlayerMessage =
  | { type: 'JOIN'; playerId: string; name: string }
  | { type: 'BUZZ'; playerId: string }

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

const PHASES = new Set(['lobby', 'waiting', 'playing', 'buzzed', 'revealed', 'finished'])

function isPhase(value: unknown): value is PublicState['phase'] {
  return typeof value === 'string' && PHASES.has(value)
}

const OUTCOMES = new Set(['correct', 'allWrong', 'timeout', 'skipped'])

function isOutcome(value: unknown): value is NonNullable<PublicState['outcome']> {
  return typeof value === 'string' && OUTCOMES.has(value)
}

/** A field that is either absent-as-null or a finite number, never anything else. */
function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function parsePublicPlayer(raw: unknown): PublicState['players'][number] | null {
  const player = asRecord(raw)
  if (!player) return null
  if (!nonEmptyString(player.id)) return null
  if (typeof player.name !== 'string') return null
  if (!isFiniteNumber(player.score)) return null
  return { id: player.id, name: player.name, score: player.score }
}

/** Validates a STATE payload's whole shape, not just that it is an object. */
function parsePublicState(raw: unknown): PublicState | null {
  const state = asRecord(raw)
  if (!state || Array.isArray(raw)) return null
  if (!isPhase(state.phase)) return null
  if (!Array.isArray(state.players)) return null

  const players: PublicState['players'] = []
  for (const rawPlayer of state.players) {
    const player = parsePublicPlayer(rawPlayer)
    if (!player) return null
    players.push(player)
  }

  if (!Array.isArray(state.lockedOut) || !state.lockedOut.every(nonEmptyString)) return null
  const lockedOut = state.lockedOut

  if (state.buzzedPlayerId !== null && !nonEmptyString(state.buzzedPlayerId)) return null
  const buzzedPlayerId = state.buzzedPlayerId as string | null

  if (state.winnerId !== null && !nonEmptyString(state.winnerId)) return null
  const winnerId = state.winnerId as string | null

  if (state.outcome !== null && !isOutcome(state.outcome)) return null
  const outcome = state.outcome as PublicState['outcome']

  if (!isNullableNumber(state.pointsAtStake) || !isNullableNumber(state.remainingMs)) return null
  if (!isNullableNumber(state.tierDurationMs)) return null

  if (!isFiniteNumber(state.roundsPlayed) || !isFiniteNumber(state.roundsTotal)) return null

  return {
    phase: state.phase,
    players,
    lockedOut,
    buzzedPlayerId,
    outcome,
    winnerId,
    pointsAtStake: state.pointsAtStake,
    tierDurationMs: state.tierDurationMs,
    remainingMs: state.remainingMs,
    roundsPlayed: state.roundsPlayed,
    roundsTotal: state.roundsTotal,
  }
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

  if (message.type === 'STATE') {
    const state = parsePublicState(message.state)
    return state ? { type: 'STATE', state } : null
  }
  return null
}
