import { describe, expect, test } from 'vitest'
import { nextTier, pointsForTier, tierDurationMs } from '@/game/tiers'

describe('tiers', () => {
  test('points shrink as the tier grows', () => {
    expect(pointsForTier(1)).toBe(5)
    expect(pointsForTier(2)).toBe(3)
    expect(pointsForTier(3)).toBe(1)
  })

  test('durations are absolute, measured from the song start point', () => {
    expect(tierDurationMs(1)).toBe(5_000)
    expect(tierDurationMs(2)).toBe(10_000)
    expect(tierDurationMs(3)).toBe(30_000)
  })

  test('tiers advance one by one', () => {
    expect(nextTier(1)).toBe(2)
    expect(nextTier(2)).toBe(3)
  })

  test('there is nothing after the third tier', () => {
    expect(nextTier(3)).toBeNull()
  })
})
