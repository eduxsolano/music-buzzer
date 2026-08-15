import type { GameEvent, GameState, Player, Song } from '@/game/types'

/**
 * Everything a phase panel is allowed to see.
 *
 * One object, passed down whole, so adding a phase never means threading a
 * new prop through the shell. Panels narrow their own `phase` from the
 * switch in `HostStage`; nothing here knows about YouTube or Supabase.
 */
export interface HostView {
  room: string
  /** Where this page is served from, so links and QRs point at the right host. */
  origin: string
  state: GameState
  song: Song | null
  audioReady: boolean
  /** Players sorted by score, highest first. */
  scoreboard: Player[]
  /** True while the last judgement can still be taken back. */
  canUndo: boolean
  dispatch: (event: GameEvent) => void
  startGame: () => void
  /** Judges the current buzz and flashes the room green or red. */
  judge: (correct: boolean) => void
  /** Restores the state from immediately before the last judgement. */
  undo: () => void
  newGame: () => void
}

export function playerName(view: HostView, playerId: string | null): string | null {
  if (!playerId) return null
  return view.state.players.find((player) => player.id === playerId)?.name ?? null
}
