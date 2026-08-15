import type { Tier } from '@/game/tiers'
import type { Phase } from '@/game/types'

export interface AudioSnapshot {
  kind: Phase['kind']
  tier: Tier | null
  /**
   * Only meaningful while `waiting`: the tier the host is about to launch was
   * cut part-way through, so it must continue rather than start over.
   */
  resumes: boolean
}

export type AudioAction = 'play' | 'resume' | 'pause' | 'stop' | 'none'

/**
 * Drops elapsedMs on purpose: ticking must not look like a change.
 *
 * Exhaustive with an annotated return type, so a new phase has to declare
 * what the speaker is doing in it instead of silently falling through.
 */
export function snapshot(phase: Phase): AudioSnapshot {
  switch (phase.kind) {
    case 'playing':
      return { kind: 'playing', tier: phase.tier, resumes: false }
    case 'waiting':
      // resumeAtMs is 0 for a fresh tier and the exact cut point after a wrong
      // answer; that is the whole difference between playing and resuming.
      return { kind: 'waiting', tier: phase.launchTier, resumes: phase.resumeAtMs > 0 }
    case 'lobby':
    case 'buzzed':
    case 'revealed':
    case 'finished':
      return { kind: phase.kind, tier: null, resumes: false }
  }
}

export function audioActionFor(prev: AudioSnapshot, next: AudioSnapshot): AudioAction {
  if (next.kind === 'buzzed') return prev.kind === 'buzzed' ? 'none' : 'pause'

  if (next.kind === 'revealed' || next.kind === 'finished') {
    return prev.kind === 'revealed' || prev.kind === 'finished' ? 'none' : 'stop'
  }

  // The host is holding the room between tiers. Whatever was sounding goes
  // quiet, but the player keeps its position so a cut tier can carry on.
  if (next.kind === 'waiting') return prev.kind === 'playing' ? 'pause' : 'none'

  if (next.kind !== 'playing') return 'none'

  // A wrong answer sends the round back to `waiting` on the very tier it cut,
  // at the very millisecond it cut. Launching from there resumes; restarting
  // would hand out the hook a second time.
  if (prev.kind === 'waiting') return prev.resumes ? 'resume' : 'play'

  return prev.kind === 'playing' && prev.tier === next.tier ? 'none' : 'play'
}
