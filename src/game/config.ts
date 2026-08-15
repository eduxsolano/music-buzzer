export interface TierConfig {
  tier: 1 | 2 | 3
  durationMs: number
  points: number
}

/** Every tier restarts the song at `startSeconds`; durations are absolute, not cumulative. */
export const TIERS: readonly TierConfig[] = [
  { tier: 1, durationMs: 5_000, points: 5 },
  { tier: 2, durationMs: 10_000, points: 3 },
  // Tier 3 is the last chance, so it needs to be worth taking. At 1 point
  // with a 1-point wrong-answer penalty, break-even needs >50% confidence —
  // the rational move in the final tier is silence. At 2 points, break-even
  // drops to about a third, so guessing is worth it again. Shortening it to
  // 15 s (from 30 s) also cuts 15 s of new audio that used to play after the
  // room had already given up — about five minutes of dead air over a
  // 20-song game.
  { tier: 3, durationMs: 15_000, points: 2 },
] as const

export const WRONG_ANSWER_PENALTY = 1

export const DEFAULT_ROUNDS = 20
