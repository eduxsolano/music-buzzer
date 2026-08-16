import { remainingTierMs, tierTotalMs } from '@/game/countdown'
import { pointsForTier } from '@/game/tiers'
import type { GameState, Phase, PlayerId, RevealOutcome } from '@/game/types'

/**
 * Everything a phone is told, except the countdown.
 *
 * This is the part that decides *whether* to publish at all: the host
 * compares consecutive projections and only sends when one differs. Nothing
 * that changes on every tick may live in here — see the comment on the
 * publish effect in `useHostGame.ts`, which exists because a ticking field
 * once saturated the shared Supabase channel.
 */
export interface PublicStateCore {
  phase: Phase['kind']
  players: { id: PlayerId; name: string; score: number }[]
  /** Eliminated from the current song only. */
  lockedOut: PlayerId[]
  buzzedPlayerId: PlayerId | null
  /** How the round ended, once it has. Says nothing about which song it was. */
  outcome: RevealOutcome | null
  /** Who scored this round, so their own phone can celebrate. */
  winnerId: PlayerId | null
  /** What a press is worth right now; null when a press cannot score. */
  pointsAtStake: number | null
  /**
   * How long the tier in play lasts from end to end. The phone needs it to
   * draw its buzzer ring as a fraction; without it a remainder is a number
   * with no scale. Tier-derived, so it moves once per tier and never per tick.
   */
  tierDurationMs: number | null
  roundsPlayed: number
  roundsTotal: number
}

/** The message a phone actually receives. */
export interface PublicState extends PublicStateCore {
  /**
   * Milliseconds left of the tier in play at the instant this message was
   * sent. The phone starts its own countdown from here rather than being told
   * twenty times a second; a phone that joins mid-tier gets a correct
   * remainder for free, because joining changes the player list and therefore
   * triggers a publish.
   */
  remainingMs: number | null
}

/**
 * Points a press would earn in this phase.
 *
 * Exhaustive with an annotated return type: a new phase has to say what a
 * press is worth in it rather than defaulting to nothing.
 *
 * `waiting` splits in two: once something has sounded this round a press
 * still earns the tier that just played, but the round's very first wait —
 * before the host has launched tier 1 even once — cannot be acted on, so a
 * press there is worth nothing. This is also what tells a phone whether its
 * button may act: see `buttonState` in `src/play/playerIdentity.ts`, which
 * treats `waiting` as armed only when this is non-null.
 */
export function pointsAtStake(phase: Phase): number | null {
  switch (phase.kind) {
    case 'playing':
      return pointsForTier(phase.tier)
    case 'waiting':
      return phase.heardThisRound ? pointsForTier(phase.worthTier) : null
    case 'buzzed':
      return pointsForTier(phase.worthTier)
    case 'lobby':
    case 'revealed':
    case 'finished':
      return null
  }
}

/**
 * Projection sent to the phones. Deliberately omits the deck and the current
 * song: players can open DevTools, so nothing identifying may cross this line.
 * `outcome` and `winnerId` name a player, never a song, so they are safe here.
 */
export function toPublicState(state: GameState): PublicStateCore {
  return {
    phase: state.phase.kind,
    players: state.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
    lockedOut: [...state.lockedOut],
    buzzedPlayerId: state.phase.kind === 'buzzed' ? state.phase.playerId : null,
    outcome: state.phase.kind === 'revealed' ? state.phase.outcome : null,
    winnerId: state.phase.kind === 'revealed' ? state.phase.winnerId : null,
    pointsAtStake: pointsAtStake(state.phase),
    tierDurationMs: tierTotalMs(state.phase),
    roundsPlayed: state.roundsPlayed,
    roundsTotal: state.roundsTotal,
  }
}

/**
 * Attaches the countdown at send time.
 *
 * Kept out of `toPublicState` on purpose, and enforced by the types: the
 * object the host compares against the last one it sent cannot contain
 * `remainingMs`, so the countdown can never be the reason a publish happens.
 */
export function withCountdown(core: PublicStateCore, phase: Phase): PublicState {
  return { ...core, remainingMs: remainingTierMs(phase) }
}
