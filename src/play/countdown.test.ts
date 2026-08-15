import { describe, expect, test } from 'vitest'
import { PULSE_AT_MS, displayedRemainingMs, ringFraction, shouldPulse } from '@/play/countdown'

describe('displayedRemainingMs', () => {
  test('counts down locally from the remainder the host sent', () => {
    expect(displayedRemainingMs(5_000, 0, true)).toBe(5_000)
    expect(displayedRemainingMs(5_000, 1_500, true)).toBe(3_500)
  })

  test('stops at zero rather than going negative if no new message arrives', () => {
    expect(displayedRemainingMs(5_000, 9_000, true)).toBe(0)
  })

  test('holds still while nothing is sounding', () => {
    // Between tiers, and while somebody is being judged, the number is a
    // promise about what the host will play, not a measurement.
    expect(displayedRemainingMs(10_000, 4_000, false)).toBe(10_000)
  })

  test('a clock that jumped backwards never buys extra time', () => {
    expect(displayedRemainingMs(5_000, -30_000, true)).toBe(5_000)
  })

  test('says nothing when the host has no tier in play', () => {
    expect(displayedRemainingMs(null, 1_000, true)).toBeNull()
    expect(displayedRemainingMs(null, 1_000, false)).toBeNull()
  })
})

describe('ringFraction', () => {
  test('is full at the top of a tier and empty at its end', () => {
    expect(ringFraction(10_000, 10_000, true)).toBe(1)
    expect(ringFraction(0, 10_000, true)).toBe(0)
  })

  test('drains in proportion, whatever the tier is worth', () => {
    expect(ringFraction(2_500, 10_000, true)).toBeCloseTo(0.25, 10)
    expect(ringFraction(1_000, 5_000, true)).toBeCloseTo(0.2, 10)
  })

  test('draws NOTHING between tiers, rather than a full or an empty ring', () => {
    // Both fakes lie: full promises a tier that has not started, empty says
    // the time ran out. The only honest answer while nothing is sounding is
    // no ring at all.
    expect(ringFraction(10_000, 10_000, false)).toBeNull()
    expect(ringFraction(7_000, 10_000, false)).toBeNull()
    expect(ringFraction(0, 10_000, false)).toBeNull()
  })

  test('draws nothing when the host has no tier in play at all', () => {
    expect(ringFraction(null, 10_000, true)).toBeNull()
    expect(ringFraction(4_000, null, true)).toBeNull()
  })

  test('a nonsense duration draws nothing instead of dividing by zero', () => {
    expect(ringFraction(4_000, 0, true)).toBeNull()
    expect(ringFraction(4_000, -1, true)).toBeNull()
  })

  test('never overflows its track if the clocks disagree', () => {
    expect(ringFraction(30_000, 10_000, true)).toBe(1)
  })
})

describe('shouldPulse', () => {
  test('stays still while there is more than three seconds of tier left', () => {
    expect(shouldPulse(PULSE_AT_MS + 1, true, true, false)).toBe(false)
    expect(shouldPulse(5_000, true, true, false)).toBe(false)
  })

  test('fires as the third second begins', () => {
    expect(shouldPulse(PULSE_AT_MS, true, true, false)).toBe(true)
    expect(shouldPulse(2_400, true, true, false)).toBe(true)
    expect(shouldPulse(0, true, true, false)).toBe(true)
  })

  test('once per run of the clock, never a pattern of them', () => {
    // The caller sets the flag the moment it fires; six phones repeating this
    // every tier would be noise rather than a signal.
    expect(shouldPulse(2_000, true, true, true)).toBe(false)
  })

  test('only while a tier is actually sounding', () => {
    expect(shouldPulse(2_000, false, true, false)).toBe(false)
    expect(shouldPulse(null, true, true, false)).toBe(false)
  })

  test('only on a phone that can still do something about it', () => {
    // Locked out of this song, or waiting to be judged: a buzz in the pocket
    // would be telling somebody about a decision that is not theirs to make.
    expect(shouldPulse(2_000, true, false, false)).toBe(false)
  })
})
