import type { Tier } from '@/game/tiers'

export type PlayerId = string

export interface Player {
  id: PlayerId
  name: string
  score: number
}

export interface Song {
  id: string
  videoId: string
  title: string
  artist: string
  year: number
  startSeconds: number
}

export type RevealOutcome = 'correct' | 'allWrong' | 'timeout' | 'skipped'

/**
 * The three facts that describe every silence in a round.
 *
 * They are stored, never derived, because deriving them is exactly where the
 * rules stop being readable: "which tier was the previous one" and "was this
 * silence a pause or a cut" are questions no reader of this file should have
 * to answer. `waiting` and `buzzed` both carry them, which is the point — a
 * buzz is a silence with a name attached, and judging it wrong hands the same
 * three facts straight back.
 */
export interface Stakes {
  /** What a press is worth *right now*. Frozen at the press on `buzzed`. */
  worthTier: Tier
  /** The tier the host's launch button will sound. */
  launchTier: Tier
  /** Millisecond inside `launchTier` at which playback resumes; 0 for a fresh tier. */
  resumeAtMs: number
}

export type Phase =
  | { kind: 'lobby' }
  | ({ kind: 'waiting' } & Stakes)
  | { kind: 'playing'; tier: Tier; elapsedMs: number }
  | ({ kind: 'buzzed'; playerId: PlayerId } & Stakes)
  | { kind: 'revealed'; outcome: RevealOutcome; winnerId: PlayerId | null }
  | { kind: 'finished' }

export interface GameState {
  players: Player[]
  /** Song ids not yet played, already shuffled. */
  deck: string[]
  currentSongId: string | null
  roundsPlayed: number
  roundsTotal: number
  /** Players eliminated from the CURRENT song only. Cleared on every new round. */
  lockedOut: PlayerId[]
  phase: Phase
}

export type GameEvent =
  | { type: 'JOIN'; playerId: PlayerId; name: string }
  | { type: 'START_GAME'; deck: string[]; roundsTotal: number }
  /** The host sounds the tier the current `waiting` phase is holding. */
  | { type: 'LAUNCH_TIER' }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'BUZZ'; playerId: PlayerId }
  | { type: 'JUDGE'; correct: boolean }
  | { type: 'SKIP_SONG' }
  | { type: 'NEXT_ROUND' }
