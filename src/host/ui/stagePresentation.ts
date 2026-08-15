import type { Phase, RevealOutcome } from '@/game/types'
import { tierDurationMs, type Tier } from '@/game/tiers'

/**
 * The presentation vocabulary of the host screen, kept pure so it can be
 * tested and so the phase components stay pure layout.
 *
 * The idea the whole screen is built on: **the colour says what happened.**
 * From the sofa, four metres away, the room reads the mood before it reads a
 * word — cool while the song plays, amber the instant someone presses, green
 * or red on the judgement.
 */
export type Mood = 'idle' | 'hold' | 'live' | 'buzzed' | 'correct' | 'wrong' | 'over'

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
    // A held breath, not a dead screen: the same cool family as `live`, dimmed
    // and drawn in, so the room reads "the music stopped and something is
    // about to happen" without a word.
    case 'waiting':
      return 'hold'
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

/** What the tier meter should show: a running tier, or nothing at all. */
export interface TierClock {
  tier: Tier | null
  elapsedMs: number
}

/**
 * Where the tier clock stands in a given phase.
 *
 * Written as an exhaustive switch with an annotated return type and no
 * `default`, rather than as `phase.kind === 'playing' || …`: a boolean test
 * would let a new phase fall through to "no tier" with nothing to warn
 * anybody. Here the compiler stops on TS2366 until the new phase says what
 * its clock does.
 *
 * A buzz freezes the tier rather than ending it, so the meter freezes with
 * it — the room can see exactly how much of the tier was left when the music
 * cut. `waiting` shows the same thing from the other side: the tier the host
 * is about to launch, already drained by however much of it was heard.
 */
export function tierClockFor(phase: Phase): TierClock {
  switch (phase.kind) {
    case 'playing':
      return { tier: phase.tier, elapsedMs: phase.elapsedMs }
    case 'waiting':
    case 'buzzed':
      return { tier: phase.launchTier, elapsedMs: phase.resumeAtMs }
    case 'lobby':
    case 'revealed':
    case 'finished':
      return { tier: null, elapsedMs: 0 }
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

/**
 * What the host's launch button promises.
 *
 * Sounding a tier for the first time and picking a cut one back up are two
 * different acts, and the button has to say which: after a wrong answer the
 * room already heard the first seconds and needs to know the music continues
 * rather than starts over.
 */
export function launchLabel(launchTier: Tier, resumeAtMs: number): string {
  if (resumeAtMs > 0) return 'Retomar donde se cortó'
  return `Sonar ${Math.round(tierDurationMs(launchTier) / 1_000)} segundos`
}

/** The line under the launch button: why the room is standing still. */
export function waitingNote(worthPoints: number): string {
  return worthPoints === 1 ? 'punto en juego ahora' : 'puntos en juego ahora'
}

export function playersConnectedLabel(count: number): string {
  if (count === 0) return 'Esperando jugadores'
  return count === 1 ? '1 jugador conectado' : `${count} jugadores conectados`
}

export function roundLabel(played: number, total: number): string {
  return `Canción ${played} de ${total}`
}
