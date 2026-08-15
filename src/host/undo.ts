import { reduce } from '@/game/reducer'
import type { GameEvent, GameState } from '@/game/types'

/**
 * A game, plus the one state it is allowed to go back to.
 *
 * Undo exists because a mistaken ❌ is otherwise irreversible: the player has
 * lost a point and is out of the song, and the person judging is holding a
 * drink. It is the single most valuable control on the panel.
 *
 * The way it is built matters more than the fact it exists. There is **no
 * inverse of JUDGE anywhere** — no "give the point back, un-eliminate them,
 * work out which phase they came from, restore the frozen tier and the
 * millisecond the music was cut at". That reconstruction is where the subtle
 * bugs live, and it would have to be kept in step with every future rule
 * change. Instead the state from immediately before the judgement is kept
 * whole and put back whole, so undo restores the score, the elimination list,
 * the phase and the frozen stakes by construction rather than by argument.
 *
 * The reducer never learns any of this. It stays a pure function of (state,
 * event); this module is a wrapper around it that the host page owns.
 */
export interface HostSession {
  game: GameState
  /** The state to restore, or null when there is nothing to take back. */
  undo: GameState | null
}

export function initialSession(game: GameState): HostSession {
  return { game, undo: null }
}

/**
 * Applies an event and decides whether the offer to undo survives it.
 *
 * The reducer returns the very same object when an event does not apply (a
 * BUZZ from someone eliminated, a JUDGE while nobody is buzzed), so reference
 * equality is exactly "nothing happened" — and a judgement that the engine
 * ignored must not arm an undo that would then rewind an unrelated moment.
 */
export function step(session: HostSession, event: GameEvent): HostSession {
  const game = reduce(session.game, event)
  if (game === session.game) return session

  if (event.type === 'JUDGE') return { game, undo: session.game }

  // Undo is offered only until the next round is dealt. Once the room has
  // moved to another song — or the game is over, which clears the song —
  // going back to the previous one would be a different kind of act
  // altogether, and the audio has already been handed on.
  const sameRound =
    game.roundsPlayed === session.game.roundsPlayed &&
    game.currentSongId === session.game.currentSongId
  return sameRound ? { game, undo: session.undo } : { game, undo: null }
}

/**
 * Puts the last judgement back the way it was.
 *
 * One shot: the restored state is the one *before* the judgement, so it holds
 * no undo of its own, and a second press cannot walk further back into a round
 * whose audio position no longer exists.
 */
export function undoJudgement(session: HostSession): HostSession {
  if (!session.undo) return session
  return { game: session.undo, undo: null }
}
