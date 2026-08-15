import { tierDurationMs } from '@/game/tiers'
import type { Phase } from '@/game/types'

/**
 * How much of the tier in play is still to be heard.
 *
 * Pure, like everything else in `src/game/`: it reads the phase, never a
 * clock. The host page owns the wall clock and calls this at the instant it
 * publishes; the phone counts down locally from the number it receives.
 *
 * While `waiting` and `buzzed` the music is stopped, so the answer is the
 * whole of what the launch button is about to play — a full tier, or the
 * remainder of the one that was cut. That is exactly what the room wants to
 * know before the host presses.
 *
 * Written as an exhaustive switch with an annotated return type and no
 * `default` so a new phase cannot silently inherit "no countdown".
 */
export function remainingTierMs(phase: Phase): number | null {
  switch (phase.kind) {
    case 'playing':
      return Math.max(0, tierDurationMs(phase.tier) - phase.elapsedMs)
    case 'waiting':
    case 'buzzed':
      return Math.max(0, tierDurationMs(phase.launchTier) - phase.resumeAtMs)
    case 'lobby':
    case 'revealed':
    case 'finished':
      return null
  }
}

/**
 * How long the tier in play runs from end to end.
 *
 * The counterpart of `remainingTierMs`: a remainder only means something
 * against the whole it came from, and the phone draws a ring rather than a
 * number. `waiting` and `buzzed` report the tier the launch button holds,
 * matching what `remainingTierMs` counts down.
 */
export function tierTotalMs(phase: Phase): number | null {
  switch (phase.kind) {
    case 'playing':
      return tierDurationMs(phase.tier)
    case 'waiting':
    case 'buzzed':
      return tierDurationMs(phase.launchTier)
    case 'lobby':
    case 'revealed':
    case 'finished':
      return null
  }
}

/**
 * The whole seconds a screen shows.
 *
 * Rounded up, so the last second is displayed as `1` for the whole of it and
 * `0` only once the tier is genuinely over — a countdown that shows `0` while
 * the song is still playing reads as broken.
 */
export function countdownSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1_000))
}
