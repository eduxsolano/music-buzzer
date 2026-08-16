import { describe, expect, test } from 'vitest'
import { countdownSeconds, remainingTierMs, tierTotalMs } from '@/game/countdown'
import type { Phase } from '@/game/types'

describe('remainingTierMs', () => {
  test('drains as the tier plays', () => {
    expect(remainingTierMs({ kind: 'playing', tier: 1, elapsedMs: 0 })).toBe(5_000)
    expect(remainingTierMs({ kind: 'playing', tier: 1, elapsedMs: 1_800 })).toBe(3_200)
    expect(remainingTierMs({ kind: 'playing', tier: 3, elapsedMs: 14_500 })).toBe(500)
  })

  test('never goes negative, however far a tick overshot', () => {
    expect(remainingTierMs({ kind: 'playing', tier: 1, elapsedMs: 9_000 })).toBe(0)
  })

  test('while waiting, it is the whole of what the launch button will play', () => {
    expect(
      remainingTierMs({
        kind: 'waiting',
        worthTier: 1,
        launchTier: 2,
        resumeAtMs: 0,
        heardThisRound: true,
      }),
    ).toBe(10_000)
  })

  test('a wait that will resume a cut tier counts only what is left of it', () => {
    expect(
      remainingTierMs({
        kind: 'waiting',
        worthTier: 2,
        launchTier: 2,
        resumeAtMs: 3_000,
        heardThisRound: true,
      }),
    ).toBe(7_000)
  })

  test('a buzz freezes the clock at what was left when the music cut', () => {
    expect(
      remainingTierMs({
        kind: 'buzzed',
        playerId: 'p1',
        worthTier: 1,
        launchTier: 1,
        resumeAtMs: 2_000,
      }),
    ).toBe(3_000)
  })

  test('there is no clock in the phases where no tier is in play', () => {
    expect(remainingTierMs({ kind: 'lobby' })).toBeNull()
    expect(remainingTierMs({ kind: 'revealed', outcome: 'correct', winnerId: 'p1' })).toBeNull()
    expect(remainingTierMs({ kind: 'finished' })).toBeNull()
  })
})

describe('tierTotalMs', () => {
  test('is the whole the remainder is measured against, in every phase that has one', () => {
    expect(tierTotalMs({ kind: 'playing', tier: 2, elapsedMs: 4_000 })).toBe(10_000)
    expect(
      tierTotalMs({
        kind: 'waiting',
        worthTier: 1,
        launchTier: 2,
        resumeAtMs: 0,
        heardThisRound: true,
      }),
    ).toBe(10_000)
    expect(
      tierTotalMs({
        kind: 'buzzed',
        playerId: 'p1',
        worthTier: 3,
        launchTier: 3,
        resumeAtMs: 900,
      }),
    ).toBe(15_000)
  })

  test('agrees with the remainder it scales, so a ring can never read past full', () => {
    const phase: Phase = {
      kind: 'waiting',
      worthTier: 2,
      launchTier: 2,
      resumeAtMs: 3_000,
      heardThisRound: true,
    }
    expect(remainingTierMs(phase)!).toBeLessThanOrEqual(tierTotalMs(phase)!)
  })

  test('is nothing where there is no tier', () => {
    expect(tierTotalMs({ kind: 'lobby' })).toBeNull()
    expect(tierTotalMs({ kind: 'revealed', outcome: 'skipped', winnerId: null })).toBeNull()
    expect(tierTotalMs({ kind: 'finished' })).toBeNull()
  })
})

describe('countdownSeconds', () => {
  test('rounds up, so the last second is shown for the whole of it', () => {
    expect(countdownSeconds(5_000)).toBe(5)
    expect(countdownSeconds(4_001)).toBe(5)
    expect(countdownSeconds(4_000)).toBe(4)
    expect(countdownSeconds(1)).toBe(1)
  })

  test('reaches zero only when the tier is genuinely over', () => {
    expect(countdownSeconds(0)).toBe(0)
    expect(countdownSeconds(-500)).toBe(0)
  })
})
