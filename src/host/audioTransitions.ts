import type { Tier } from '@/game/tiers'
import type { Phase } from '@/game/types'

export interface AudioSnapshot {
  kind: Phase['kind']
  tier: Tier | null
}

export type AudioAction = 'play' | 'resume' | 'pause' | 'stop' | 'none'

/** Drops elapsedMs on purpose: ticking must not look like a change. */
export function snapshot(phase: Phase): AudioSnapshot {
  return { kind: phase.kind, tier: phase.kind === 'playing' ? phase.tier : null }
}

export function audioActionFor(prev: AudioSnapshot, next: AudioSnapshot): AudioAction {
  if (next.kind === 'buzzed') return prev.kind === 'buzzed' ? 'none' : 'pause'

  if (next.kind === 'revealed' || next.kind === 'finished') {
    return prev.kind === 'revealed' || prev.kind === 'finished' ? 'none' : 'stop'
  }

  if (next.kind !== 'playing') return 'none'

  // A wrong answer returns us to the very tier we cut, at the very millisecond
  // we cut it. Resuming is the spec; restarting would hand out the hook again.
  if (prev.kind === 'buzzed') return 'resume'

  return prev.kind === 'playing' && prev.tier === next.tier ? 'none' : 'play'
}
