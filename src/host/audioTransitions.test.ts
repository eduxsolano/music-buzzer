import { describe, expect, test } from 'vitest'
import { audioActionFor, snapshot, type AudioSnapshot } from '@/host/audioTransitions'
import type { Phase } from '@/game/types'

const lobby: AudioSnapshot = { kind: 'lobby', tier: null, resumes: false }
const playing = (tier: 1 | 2 | 3): AudioSnapshot => ({ kind: 'playing', tier, resumes: false })
/** The host is holding the room before a tier that has not been heard yet. */
const holding = (tier: 1 | 2 | 3): AudioSnapshot => ({ kind: 'waiting', tier, resumes: false })
/** The host is holding the room over a tier that was cut part-way through. */
const holdingCut = (tier: 1 | 2 | 3): AudioSnapshot => ({ kind: 'waiting', tier, resumes: true })
const buzzed: AudioSnapshot = { kind: 'buzzed', tier: null, resumes: false }
const revealed: AudioSnapshot = { kind: 'revealed', tier: null, resumes: false }
const finished: AudioSnapshot = { kind: 'finished', tier: null, resumes: false }

describe('snapshot', () => {
  test('keeps the tier only while a song is playing', () => {
    const phase: Phase = { kind: 'playing', tier: 2, elapsedMs: 3_000 }
    expect(snapshot(phase)).toEqual({ kind: 'playing', tier: 2, resumes: false })
  })

  test('ignores elapsed time, so ticking does not churn the audio', () => {
    expect(snapshot({ kind: 'playing', tier: 1, elapsedMs: 10 })).toEqual(
      snapshot({ kind: 'playing', tier: 1, elapsedMs: 4_000 }),
    )
  })

  test('a wait carries the tier it is about to launch', () => {
    expect(snapshot({ kind: 'waiting', worthTier: 1, launchTier: 2, resumeAtMs: 0 })).toEqual({
      kind: 'waiting',
      tier: 2,
      resumes: false,
    })
  })

  test('a wait over a cut tier says so, because it must continue rather than restart', () => {
    expect(snapshot({ kind: 'waiting', worthTier: 2, launchTier: 2, resumeAtMs: 3_000 })).toEqual({
      kind: 'waiting',
      tier: 2,
      resumes: true,
    })
  })
})

describe('audioActionFor', () => {
  test('starts the song when the host launches the first tier', () => {
    expect(audioActionFor(holding(1), playing(1))).toBe('play')
  })

  test('does nothing while the clock merely ticks', () => {
    expect(audioActionFor(playing(1), playing(1))).toBe('none')
  })

  test('goes quiet when a tier runs out and the host takes over', () => {
    expect(audioActionFor(playing(1), holding(2))).toBe('pause')
  })

  test('restarts the song when the host launches the next tier', () => {
    expect(audioActionFor(holding(2), playing(2))).toBe('play')
    expect(audioActionFor(holding(3), playing(3))).toBe('play')
  })

  test('cuts the audio the moment somebody buzzes', () => {
    expect(audioActionFor(playing(2), buzzed)).toBe('pause')
    expect(audioActionFor(holding(2), buzzed)).toBe('pause')
  })

  test('RESUMES after a wrong answer instead of restarting the song', () => {
    expect(audioActionFor(holdingCut(2), playing(2))).toBe('resume')
  })

  test('the whole wrong-answer chain never restarts the tier', () => {
    // playing → buzzed → waiting(cut) → playing, which is exactly the path a
    // ❌ takes now that the host decides when the music comes back.
    expect(audioActionFor(playing(2), buzzed)).toBe('pause')
    expect(audioActionFor(buzzed, holdingCut(2))).toBe('none')
    expect(audioActionFor(holdingCut(2), playing(2))).toBe('resume')
  })

  test('stops when the song is revealed or the game ends', () => {
    expect(audioActionFor(playing(3), revealed)).toBe('stop')
    expect(audioActionFor(buzzed, revealed)).toBe('stop')
    expect(audioActionFor(revealed, finished)).toBe('none')
  })

  test('the pause at the start of a round has nothing to silence', () => {
    expect(audioActionFor(revealed, holding(1))).toBe('none')
    expect(audioActionFor(lobby, holding(1))).toBe('none')
  })

  test('a session reset silences whatever was sounding, from any phase', () => {
    expect(audioActionFor(playing(2), lobby)).toBe('stop')
    expect(audioActionFor(holding(1), lobby)).toBe('stop')
    expect(audioActionFor(holdingCut(2), lobby)).toBe('stop')
    expect(audioActionFor(buzzed, lobby)).toBe('stop')
    expect(audioActionFor(revealed, lobby)).toBe('stop')
    expect(audioActionFor(finished, lobby)).toBe('stop')
  })

  test('landing in the lobby a second time in a row is a no-op', () => {
    expect(audioActionFor(lobby, lobby)).toBe('none')
  })

  test('starts the next song fresh after a reveal', () => {
    expect(audioActionFor(holding(1), playing(1))).toBe('play')
  })

  test('is idempotent when the phase has not changed', () => {
    expect(audioActionFor(revealed, revealed)).toBe('none')
    expect(audioActionFor(buzzed, buzzed)).toBe('none')
    expect(audioActionFor(holding(2), holding(2))).toBe('none')
  })
})
