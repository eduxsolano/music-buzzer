import { describe, expect, test } from 'vitest'
import { audioActionFor, snapshot, type AudioSnapshot } from '@/host/audioTransitions'
import type { Phase } from '@/game/types'

const lobby: AudioSnapshot = { kind: 'lobby', tier: null }
const playing = (tier: 1 | 2 | 3): AudioSnapshot => ({ kind: 'playing', tier })
const buzzed: AudioSnapshot = { kind: 'buzzed', tier: null }
const revealed: AudioSnapshot = { kind: 'revealed', tier: null }
const finished: AudioSnapshot = { kind: 'finished', tier: null }

describe('snapshot', () => {
  test('keeps the tier only while a song is playing', () => {
    const phase: Phase = { kind: 'playing', tier: 2, elapsedMs: 3_000 }
    expect(snapshot(phase)).toEqual({ kind: 'playing', tier: 2 })
  })

  test('ignores elapsed time, so ticking does not churn the audio', () => {
    expect(snapshot({ kind: 'playing', tier: 1, elapsedMs: 10 })).toEqual(
      snapshot({ kind: 'playing', tier: 1, elapsedMs: 4_000 }),
    )
  })
})

describe('audioActionFor', () => {
  test('starts the song when the first tier begins', () => {
    expect(audioActionFor(lobby, playing(1))).toBe('play')
  })

  test('does nothing while the clock merely ticks', () => {
    expect(audioActionFor(playing(1), playing(1))).toBe('none')
  })

  test('restarts the song when the tier advances', () => {
    expect(audioActionFor(playing(1), playing(2))).toBe('play')
    expect(audioActionFor(playing(2), playing(3))).toBe('play')
  })

  test('cuts the audio the moment somebody buzzes', () => {
    expect(audioActionFor(playing(2), buzzed)).toBe('pause')
  })

  test('RESUMES after a wrong answer instead of restarting the song', () => {
    expect(audioActionFor(buzzed, playing(2))).toBe('resume')
  })

  test('stops when the song is revealed or the game ends', () => {
    expect(audioActionFor(playing(3), revealed)).toBe('stop')
    expect(audioActionFor(buzzed, revealed)).toBe('stop')
    expect(audioActionFor(revealed, finished)).toBe('none')
  })

  test('starts the next song fresh after a reveal', () => {
    expect(audioActionFor(revealed, playing(1))).toBe('play')
  })

  test('is idempotent when the phase has not changed', () => {
    expect(audioActionFor(revealed, revealed)).toBe('none')
    expect(audioActionFor(buzzed, buzzed)).toBe('none')
  })
})
