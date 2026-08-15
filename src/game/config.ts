export interface TierConfig {
  tier: 1 | 2 | 3
  durationMs: number
  points: number
}

/** Every tier restarts the song at `startSeconds`; durations are absolute, not cumulative. */
export const TIERS: readonly TierConfig[] = [
  { tier: 1, durationMs: 5_000, points: 5 },
  { tier: 2, durationMs: 10_000, points: 3 },
  { tier: 3, durationMs: 30_000, points: 1 },
] as const

export const WRONG_ANSWER_PENALTY = 1

export const DEFAULT_ROUNDS = 20
