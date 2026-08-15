import { describe, expect, it } from 'vitest'
import {
  CUE_SPECS,
  PERCUSSIVE_ATTACK_SECONDS,
  cueDurationSeconds,
  type CueName,
} from '@/sounds/cueSpecs'

const CUES = Object.keys(CUE_SPECS) as CueName[]

describe('cue specs', () => {
  it('defines the three cues the game needs', () => {
    expect(CUES.sort()).toEqual(['buzz', 'correct', 'wrong'])
  })

  it.each(CUES)('%s is schedulable and cannot clip', (cue) => {
    const tones = CUE_SPECS[cue]
    expect(tones.length).toBeGreaterThan(0)
    for (const tone of tones) {
      expect(tone.startSeconds).toBeGreaterThanOrEqual(0)
      expect(tone.durationSeconds).toBeGreaterThan(0)
      expect(tone.attackSeconds).toBeGreaterThan(0)
      expect(tone.attackSeconds).toBeLessThan(tone.durationSeconds)
      expect(tone.fromHz).toBeGreaterThan(20)
      expect(tone.toHz).toBeGreaterThan(20)
      expect(tone.fromHz).toBeLessThan(20_000)
      expect(tone.toHz).toBeLessThan(20_000)
      expect(tone.peakGain).toBeGreaterThan(0)
    }
    // Every layer sounding at once must still leave headroom.
    const stacked = tones.reduce((sum, tone) => sum + tone.peakGain, 0)
    expect(stacked).toBeLessThanOrEqual(0.8)
  })

  it.each(CUES)('%s is short enough to land inside a pause (%s)', (cue) => {
    expect(cueDurationSeconds(cue)).toBeLessThanOrEqual(0.6)
  })

  it('buzz is percussive: every layer attacks immediately and dies fast', () => {
    for (const tone of CUE_SPECS.buzz) {
      expect(tone.attackSeconds).toBeLessThanOrEqual(PERCUSSIVE_ATTACK_SECONDS)
    }
    expect(cueDurationSeconds('buzz')).toBeLessThanOrEqual(0.25)
  })

  it('correct is two notes, the second later and higher than the first', () => {
    const [first, second] = CUE_SPECS.correct
    expect(CUE_SPECS.correct).toHaveLength(2)
    expect(second.startSeconds).toBeGreaterThan(first.startSeconds)
    expect(second.fromHz).toBeGreaterThan(first.fromHz)
  })

  it('wrong descends: every layer glides down', () => {
    for (const tone of CUE_SPECS.wrong) {
      expect(tone.toHz).toBeLessThan(tone.fromHz)
    }
  })

  it('cueDurationSeconds reports the end of the last tone, not the first', () => {
    const [, second] = CUE_SPECS.correct
    expect(cueDurationSeconds('correct')).toBeCloseTo(
      second.startSeconds + second.durationSeconds,
      10,
    )
  })
})
