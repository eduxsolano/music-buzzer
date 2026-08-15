'use client'

import type { Phase } from '@/game/types'
import { pointsForTier } from '@/game/tiers'
import { Hero, StagePanel } from '@/host/ui/StagePanel'
import type { HostView } from '@/host/ui/hostView'
import { roundLabel } from '@/host/ui/stagePresentation'

/**
 * The song is playing. One protagonist: the points on the table right now.
 * It changes as the tiers pass, which is the only thing anyone needs to read
 * while they are busy listening.
 */
export function PlayingPanel({
  view,
  phase,
}: {
  view: HostView
  phase: Extract<Phase, { kind: 'playing' }>
}) {
  const points = pointsForTier(phase.tier)

  return (
    <StagePanel
      kicker={roundLabel(view.state.roundsPlayed, view.state.roundsTotal)}
      hero={
        // Keyed on the tier so the number re-animates when the stakes drop.
        <Hero key={phase.tier} sizeClass="hero-xl" animation="slam">
          {points}
        </Hero>
      }
      note={points === 1 ? 'punto en juego' : 'puntos en juego'}
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
