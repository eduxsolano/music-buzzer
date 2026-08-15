'use client'

import { CUE_SPECS, type CueName, type ToneSpec } from '@/sounds/cueSpecs'

/**
 * Plays the cues from `cueSpecs.ts` through the Web Audio API.
 *
 * Two rules govern everything here:
 *
 * 1. **The context is born from a gesture.** Browsers refuse to make sound
 *    from a context created on page load, and a context created there stays
 *    suspended for good on some of them. `unlockGameSounds()` is therefore
 *    called from the host's "Empezar partida" click and from the phone's
 *    first tap — never at module load.
 * 2. **Silence is an acceptable failure; an exception is not.** A party is
 *    the worst possible place for a thrown error, so every entry point
 *    swallows whatever the audio stack throws and the game plays on mute.
 */

type AudioContextConstructor = new () => AudioContext

let context: AudioContext | null = null
let unsupported = false

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
  return candidate ?? null
}

function ensureContext(): AudioContext | null {
  if (unsupported) return null
  try {
    const Ctor = audioContextConstructor()
    if (!Ctor) {
      unsupported = true
      return null
    }
    context ??= new Ctor()
    // Safari and Chrome both hand back a suspended context when the page has
    // not been interacted with yet, and resuming is only granted inside a
    // gesture — which is exactly where this runs.
    if (context.state === 'suspended') void context.resume().catch(() => {})
    return context
  } catch {
    unsupported = true
    return null
  }
}

/**
 * Creates or resumes the audio context. Call from inside a real user gesture
 * (a click or a pointerdown handler); calling it again afterwards is free.
 */
export function unlockGameSounds(): void {
  ensureContext()
}

function scheduleTone(ctx: AudioContext, tone: ToneSpec, at: number): void {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  const start = at + tone.startSeconds
  const end = start + tone.durationSeconds

  oscillator.type = tone.waveform
  oscillator.frequency.setValueAtTime(tone.fromHz, start)
  if (tone.toHz !== tone.fromHz) {
    oscillator.frequency.exponentialRampToValueAtTime(tone.toHz, end)
  }

  // exponentialRampToValueAtTime can never reach 0, hence the tiny floor.
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(tone.peakGain, start + tone.attackSeconds)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)

  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(end + 0.02)
  // Nodes are one-shot; dropping the references here lets them be collected.
  oscillator.onended = () => {
    oscillator.disconnect()
    gain.disconnect()
  }
}

/** Plays a cue. Does nothing at all if audio was never unlocked or is unavailable. */
export function playCue(cue: CueName): void {
  const ctx = ensureContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    for (const tone of CUE_SPECS[cue]) scheduleTone(ctx, tone, now)
  } catch {
    // Deliberately silent: a missing sound must never interrupt a round.
  }
}

/** Test seam: forgets the cached context so a fresh one is built next time. */
export function resetGameSoundsForTests(): void {
  context = null
  unsupported = false
}
