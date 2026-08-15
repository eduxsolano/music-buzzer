import type { GameState, Phase, PlayerId } from '@/game/types'

export interface PublicState {
  phase: Phase['kind']
  players: { id: PlayerId; name: string; score: number }[]
  /** Eliminated from the current song only. */
  lockedOut: PlayerId[]
  buzzedPlayerId: PlayerId | null
  roundsPlayed: number
  roundsTotal: number
}

/**
 * Projection sent to the phones. Deliberately omits the deck and the current
 * song: players can open DevTools, so nothing identifying may cross this line.
 */
export function toPublicState(state: GameState): PublicState {
  return {
    phase: state.phase.kind,
    players: state.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
    lockedOut: [...state.lockedOut],
    buzzedPlayerId: state.phase.kind === 'buzzed' ? state.phase.playerId : null,
    roundsPlayed: state.roundsPlayed,
    roundsTotal: state.roundsTotal,
  }
}
