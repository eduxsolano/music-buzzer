import { afterEach, describe, expect, it, vi } from 'vitest'
import { playCue, resetGameSoundsForTests, unlockGameSounds } from '@/sounds/gameSounds'
import { CUE_SPECS } from '@/sounds/cueSpecs'

interface FakeOscillator {
  started: number | null
  stopped: number | null
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 10
  destination = {}
  oscillators: FakeOscillator[] = []
  resumeCalls = 0
  /** When set, createOscillator throws — the "audio stack fell over" case. */
  breakOscillators = false

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  resume(): Promise<void> {
    this.resumeCalls += 1
    this.state = 'running'
    return Promise.resolve()
  }

  createOscillator() {
    if (this.breakOscillators) throw new Error('no oscillators for you')
    const node: FakeOscillator = { started: null, stopped: null }
    this.oscillators.push(node)
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: (at: number) => {
        node.started = at
      },
      stop: (at: number) => {
        node.stopped = at
      },
      onended: null as null | (() => void),
    }
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
  }
}

function withWindow(value: unknown): void {
  ;(globalThis as { window?: unknown }).window = value
}

function installFakeAudio(): void {
  FakeAudioContext.instances = []
  withWindow({ AudioContext: FakeAudioContext })
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  resetGameSoundsForTests()
})

describe('game sounds', () => {
  it('does not create an audio context until asked to', () => {
    installFakeAudio()
    expect(FakeAudioContext.instances).toHaveLength(0)
    unlockGameSounds()
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('resumes the suspended context the gesture handed it', () => {
    installFakeAudio()
    unlockGameSounds()
    expect(FakeAudioContext.instances[0].state).toBe('running')
    expect(FakeAudioContext.instances[0].resumeCalls).toBe(1)
  })

  it('reuses one context across cues instead of leaking a new one each time', () => {
    installFakeAudio()
    unlockGameSounds()
    playCue('buzz')
    playCue('correct')
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('schedules one oscillator per tone, starting at the context clock', () => {
    installFakeAudio()
    playCue('correct')
    const [ctx] = FakeAudioContext.instances
    expect(ctx.oscillators).toHaveLength(CUE_SPECS.correct.length)
    expect(ctx.oscillators[0].started).toBeCloseTo(ctx.currentTime, 10)
    expect(ctx.oscillators[1].started).toBeCloseTo(
      ctx.currentTime + CUE_SPECS.correct[1].startSeconds,
      10,
    )
    for (const oscillator of ctx.oscillators) expect(oscillator.stopped).not.toBeNull()
  })

  it('stays silent instead of throwing when there is no Web Audio at all', () => {
    withWindow({})
    expect(() => unlockGameSounds()).not.toThrow()
    expect(() => playCue('buzz')).not.toThrow()
  })

  it('stays silent instead of throwing when there is no window', () => {
    expect(() => playCue('wrong')).not.toThrow()
  })

  it('stays silent instead of throwing when the context constructor fails', () => {
    withWindow({
      AudioContext: class {
        constructor() {
          throw new Error('blocked')
        }
      },
    })
    expect(() => unlockGameSounds()).not.toThrow()
    expect(() => playCue('correct')).not.toThrow()
  })

  it('stays silent instead of throwing when scheduling fails mid-cue', () => {
    installFakeAudio()
    unlockGameSounds()
    FakeAudioContext.instances[0].breakOscillators = true
    expect(() => playCue('buzz')).not.toThrow()
  })
})
