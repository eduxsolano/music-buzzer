import { describe, expect, test } from 'vitest'
import { DEFAULT_ROUNDS, TIERS, WRONG_ANSWER_PENALTY } from '@/game/config'

describe('config', () => {
  test('define exactly three tiers with the agreed durations and points', () => {
    expect(TIERS).toEqual([
      { tier: 1, durationMs: 5_000, points: 5 },
      { tier: 2, durationMs: 10_000, points: 3 },
      { tier: 3, durationMs: 30_000, points: 1 },
    ])
  })

  test('a wrong answer costs one point', () => {
    expect(WRONG_ANSWER_PENALTY).toBe(1)
  })

  test('a game is twenty songs by default', () => {
    expect(DEFAULT_ROUNDS).toBe(20)
  })
})
