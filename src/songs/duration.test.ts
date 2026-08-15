import { describe, expect, test } from 'vitest'
import { isoDurationToSeconds } from '@/songs/duration'

describe('isoDurationToSeconds', () => {
  test('parses seconds only', () => {
    expect(isoDurationToSeconds('PT45S')).toBe(45)
  })

  test('parses minutes and seconds', () => {
    expect(isoDurationToSeconds('PT4M33S')).toBe(273)
  })

  test('parses hours, minutes and seconds', () => {
    expect(isoDurationToSeconds('PT1H2M3S')).toBe(3723)
  })

  test('parses minutes only', () => {
    expect(isoDurationToSeconds('PT5M')).toBe(300)
  })

  test('parses hours only', () => {
    expect(isoDurationToSeconds('PT2H')).toBe(7200)
  })

  test('returns 0 for an unparseable string', () => {
    expect(isoDurationToSeconds('not-a-duration')).toBe(0)
  })
})
