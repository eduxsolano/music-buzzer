'use client'

import { remainingTierMs } from '@/game/countdown'
import { pointsForTier } from '@/game/tiers'
import type { Phase } from '@/game/types'
import { Hero, StagePanel } from '@/host/ui/StagePanel'
import { TierCountdown } from '@/host/ui/TierCountdown'
import { UndoButton } from '@/host/ui/UndoButton'
import type { HostView } from '@/host/ui/hostView'
import { launchLabel, roundLabel, waitingNote } from '@/host/ui/stagePresentation'

/**
 * The held breath.
 *
 * The music has stopped and the room is arguing about what the song was. The
 * host is holding it deliberately, so the screen must not read as broken or
 * finished: same protagonist as `playing` — the points a press is worth right
 * now, which have not dropped yet — over a dimmed version of the same cool
 * ground, with the clock showing what the next tier costs.
 *
 * The pressable-ness is the point. A player who names the song half a second
 * after the music cut still earns the tier that just played, so the number in
 * the middle is live information, not a leftover.
 */
export function WaitingPanel({
  view,
  phase,
}: {
  view: HostView
  phase: Extract<Phase, { kind: 'waiting' }>
}) {
  const points = pointsForTier(phase.worthTier)
  const remainingMs = remainingTierMs(phase) ?? 0

  return (
    <StagePanel
      kicker={roundLabel(view.state.roundsPlayed, view.state.roundsTotal)}
      hero={
        <Hero key={phase.worthTier} sizeClass="hero-xl" animation="enter">
          {points}
        </Hero>
      }
      note={
        <span className="flex flex-wrap items-baseline justify-center gap-x-[1em] gap-y-2">
          <span>{waitingNote(points)}</span>
          <TierCountdown remainingMs={remainingMs} running={false} />
        </span>
      }
      actions={
        <>
          <button
            onClick={() => view.dispatch({ type: 'LAUNCH_TIER' })}
            className="btn btn-primary pulse px-[clamp(2rem,4vw,4rem)] py-[clamp(0.9rem,1.6vw,1.6rem)] text-[clamp(1rem,1.7vw,1.75rem)]"
          >
            {launchLabel(phase.launchTier, phase.resumeAtMs)}
          </button>
          <button
            onClick={() => view.dispatch({ type: 'SKIP_SONG' })}
            className="btn btn-ghost px-6 py-3 text-sm"
          >
            Saltar canción
          </button>
          {/* The screen a mistaken ❌ lands on, so this is where the host looks
              the instant they realise. */}
          <UndoButton view={view} />
        </>
      }
    />
  )
}
