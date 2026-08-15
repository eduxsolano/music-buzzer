'use client'

import { remainingTierMs } from '@/game/countdown'
import type { Phase } from '@/game/types'
import { pointsForTier } from '@/game/tiers'
import { Hero, StagePanel } from '@/host/ui/StagePanel'
import { TierCountdown } from '@/host/ui/TierCountdown'
import type { HostView } from '@/host/ui/hostView'
import { roundLabel } from '@/host/ui/stagePresentation'

/**
 * The song is playing. One protagonist: the points on the table right now.
 * It changes as the tiers pass, which is the only thing anyone needs to read
 * while they are busy listening — with the seconds left directly under it, in
 * the same place the waiting screen puts them, so the number never moves.
 */
export function PlayingPanel({
  view,
  phase,
}: {
  view: HostView
  phase: Extract<Phase, { kind: 'playing' }>
}) {
  const points = pointsForTier(phase.tier)
  const remainingMs = remainingTierMs(phase) ?? 0

  return (
    <StagePanel
      kicker={roundLabel(view.state.roundsPlayed, view.state.roundsTotal)}
      hero={
        // Keyed on the tier so the number re-animates when the stakes drop.
        <Hero key={phase.tier} sizeClass="hero-xl" animation="slam">
          {points}
        </Hero>
      }
      note={
        <span className="flex flex-wrap items-baseline justify-center gap-x-[1em] gap-y-2">
          <span>{points === 1 ? 'punto en juego' : 'puntos en juego'}</span>
          <TierCountdown remainingMs={remainingMs} running />
        </span>
      }
      actions={
        <button
          onClick={() => view.dispatch({ type: 'SKIP_SONG' })}
          className="btn btn-ghost px-6 py-3 text-sm"
        >
          Saltar canción
        </button>
      }
    />
  )
}
