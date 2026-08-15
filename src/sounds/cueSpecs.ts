/**
 * The three cues of the evening, described as data so the shape of each sound
 * can be reasoned about (and tested) without a browser.
 *
 * Nothing here touches the Web Audio API — `gameSounds.ts` schedules these.
 * This is also deliberately unrelated to `src/audio/`, which is the song
 * playback abstraction; these are one-shot feedback blips.
 */

export type CueName = 'buzz' | 'correct' | 'wrong'

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle'

export interface ToneSpec {
  /** When the tone starts, in seconds after the cue is triggered. */
  startSeconds: number
  durationSeconds: number
  /** Pitch at the start of the tone. */
  fromHz: number
  /** Pitch at the end. Equal to `fromHz` for a steady note, lower for a fall. */
  toHz: number
  waveform: Waveform
  /** Linear gain at the top of the attack. Kept well under 1 to avoid clipping. */
  peakGain: number
  /** Time from silence to `peakGain`. Short means percussive. */
  attackSeconds: number
}

/** An attack at or under this is heard as a hit rather than a swell. */
export const PERCUSSIVE_ATTACK_SECONDS = 0.01

export const CUE_SPECS: Record<CueName, readonly ToneSpec[]> = {
  /**
   * Fires the instant the music cuts, so it lands in silence: bright, hard
   * and over quickly, like the buzzer on a quiz show desk.
   */
  buzz: [
    {
      startSeconds: 0,
      durationSeconds: 0.16,
      fromHz: 1180,
      toHz: 880,
      waveform: 'square',
      peakGain: 0.22,
      attackSeconds: 0.002,
    },
    {
      startSeconds: 0,
      durationSeconds: 0.1,
      fromHz: 1760,
      toHz: 1560,
      waveform: 'square',
      peakGain: 0.09,
      attackSeconds: 0.002,
    },
    {
      startSeconds: 0,
      durationSeconds: 0.09,
      fromHz: 320,
      toHz: 260,
      waveform: 'triangle',
      peakGain: 0.16,
      attackSeconds: 0.002,
    },
  ],

  /** Two rising notes: E5 then B5. */
  correct: [
    {
      startSeconds: 0,
      durationSeconds: 0.14,
      fromHz: 659.25,
      toHz: 659.25,
      waveform: 'triangle',
      peakGain: 0.2,
      attackSeconds: 0.006,
    },
    {
      startSeconds: 0.12,
      durationSeconds: 0.34,
      fromHz: 987.77,
      toHz: 987.77,
      waveform: 'triangle',
      peakGain: 0.2,
      attackSeconds: 0.006,
    },
  ],

  /** A descending buzz: two detuned saws sliding down together. */
  wrong: [
    {
      startSeconds: 0,
      durationSeconds: 0.44,
      fromHz: 320,
      toHz: 150,
      waveform: 'sawtooth',
      peakGain: 0.17,
      attackSeconds: 0.008,
    },
    {
      startSeconds: 0.02,
      durationSeconds: 0.42,
      fromHz: 161,
      toHz: 75,
      waveform: 'sawtooth',
      peakGain: 0.11,
      attackSeconds: 0.008,
    },
  ],
}

/** How long the cue rings for, from trigger to the end of its last tone. */
export function cueDurationSeconds(cue: CueName): number {
  return CUE_SPECS[cue].reduce(
    (end, tone) => Math.max(end, tone.startSeconds + tone.durationSeconds),
    0,
  )
}
