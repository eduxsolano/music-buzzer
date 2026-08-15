import type { ControlState } from '@/control/controlState'
import { launchLabel, revealHeadline, type Mood } from '@/host/ui/stagePresentation'

/**
 * What the host's phone says and how it is coloured.
 *
 * It borrows the television's vocabulary on purpose — the same six moods, the
 * same launch label, the same reveal headline — because the host looks from
 * one screen to the other all evening and two dialects would be one too many.
 * Pure, so every line of copy has a test rather than a screenshot.
 */

/**
 * The panel's colour, from the phase alone.
 *
 * A hand-held screen in a dark room reads colour before it reads words, so a
 * host glancing down knows whether they owe the room a judgement before they
 * have focused on anything.
 */
export function controlMood(phase: ControlState['phase'], outcome: ControlState['outcome']): Mood {
  switch (phase) {
    case 'lobby':
      return 'idle'
    case 'waiting':
      return 'hold'
    case 'playing':
      return 'live'
    case 'buzzed':
      return 'buzzed'
    case 'revealed':
      if (outcome === 'correct') return 'correct'
      return outcome === 'allWrong' ? 'wrong' : 'idle'
    case 'finished':
      return 'over'
  }
}

/** The line at the top of the panel: what the host is being asked to do. */
export function controlPrompt(state: ControlState): string {
  switch (state.phase) {
    case 'lobby':
      return 'Empieza la partida en la tele'
    case 'waiting':
      return state.launchResumesAtMs && state.launchResumesAtMs > 0
        ? 'La música está cortada'
        : 'Listo para el siguiente tramo'
    case 'playing':
      return 'Sonando'
    case 'buzzed':
      return `Pulsó ${state.buzzedName ?? 'alguien'}`
    case 'revealed':
      return revealHeadline(state.outcome ?? 'skipped', state.winnerName)
    case 'finished':
      return 'Fin de la partida'
  }
}

/** The button that sounds a tier, worded exactly as the television words it. */
export function controlLaunchLabel(state: ControlState): string | null {
  if (state.phase !== 'waiting' || state.launchTier === null) return null
  return launchLabel(state.launchTier, state.launchResumesAtMs ?? 0)
}

/**
 * What a press is worth, in words, or null where a press cannot score.
 *
 * The host judges out loud with this in hand — "eso vale 3" is half of what
 * makes the pause tense — so the number is worth its own line.
 */
export function stakeLabel(points: number | null): string | null {
  if (points === null) return null
  return points === 1 ? '1 punto en juego' : `${points} puntos en juego`
}
