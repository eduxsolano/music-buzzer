import type { Phase, RevealOutcome } from '@/game/types'

/**
 * The presentation vocabulary of the host screen, kept pure so it can be
 * tested and so the phase components stay pure layout.
 *
 * The idea the whole screen is built on: **the colour says what happened.**
 * From the sofa, four metres away, the room reads the mood before it reads a
 * word — cool while the song plays, amber the instant someone presses, green
 * or red on the judgement.
 */
export type Mood = 'idle' | 'live' | 'buzzed' | 'correct' | 'wrong' | 'over'

/** A judgement just delivered, held for a beat so the room registers it. */
export type Judgement = 'correct' | 'wrong'

/**
 * The `judgement` flash deliberately outranks the phase: a ❌ sends the game
 * straight back to `playing`, and without the flash the red would never be
 * seen at all.
 */
export function moodFor(phase: Phase, judgement: Judgement | null): Mood {
  if (judgement) return judgement
  switch (phase.kind) {
    case 'lobby':
      return 'idle'
    case 'playing':
      return 'live'
    case 'buzzed':
      return 'buzzed'
    case 'revealed':
      if (phase.outcome === 'correct') return 'correct'
      return phase.outcome === 'allWrong' ? 'wrong' : 'idle'
    case 'finished':
      return 'over'
  }
}

/** How much of the current tier has elapsed, as 0…1. */
export function tierProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  return Math.min(1, Math.max(0, elapsedMs / durationMs))
}

export type HeroSizeClass = 'hero-xl' | 'hero-lg' | 'hero-md' | 'hero-sm'

/**
 * Picks a display size from the length of the text, so a short name fills the
 * television and a long song title still fits on it.
 */
export function heroSizeClass(text: string): HeroSizeClass {
  const length = [...text.trim()].length
  if (length <= 5) return 'hero-xl'
  if (length <= 9) return 'hero-lg'
  if (length <= 17) return 'hero-md'
  return 'hero-sm'
}

/** The one line that explains a reveal without anyone having to ask. */
export function revealHeadline(outcome: RevealOutcome, winnerName: string | null): string {
  switch (outcome) {
    case 'correct':
      return winnerName ? `Acertó ${winnerName}` : 'Respuesta correcta'
    case 'allWrong':
      return 'Nadie acertó'
    case 'timeout':
      return 'Nadie pulsó'
    case 'skipped':
      return 'Canción saltada'
  }
}

export function playersConnectedLabel(count: number): string {
  if (count === 0) return 'Esperando jugadores'
  return count === 1 ? '1 jugador conectado' : `${count} jugadores conectados`
}

export function roundLabel(played: number, total: number): string {
  return `Canción ${played} de ${total}`
}
