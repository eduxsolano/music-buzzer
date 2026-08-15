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

export type Phase =
  | { kind: 'lobby' }
  | { kind: 'playing'; tier: Tier; elapsedMs: number }
  | { kind: 'buzzed'; tier: Tier; elapsedMs: number; playerId: PlayerId }
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
  | { type: 'TICK'; deltaMs: number }
  | { type: 'BUZZ'; playerId: PlayerId }
  | { type: 'JUDGE'; correct: boolean }
  | { type: 'SKIP_SONG' }
  | { type: 'NEXT_ROUND' }
