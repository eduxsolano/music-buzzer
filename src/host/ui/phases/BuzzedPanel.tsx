'use client'

import type { Phase } from '@/game/types'
import { pointsForTier } from '@/game/tiers'
import { Hero, StagePanel } from '@/host/ui/StagePanel'
import { playerName, type HostView } from '@/host/ui/hostView'
import { heroSizeClass } from '@/host/ui/stagePresentation'

/**
 * The loudest moment of the evening. The music has just cut, the screen is
 * amber, and one name fills the television — so the room knows who is talking
 * before it has read anything.
 */
export function BuzzedPanel({
  view,
  phase,
}: {
  view: HostView
  phase: Extract<Phase, { kind: 'buzzed' }>
}) {
  const name = playerName(view, phase.playerId) ?? 'Alguien'
  const points = pointsForTier(phase.tier)

  return (
    <StagePanel
      kicker="Pulsó primero"
      hero={
        <Hero sizeClass={heroSizeClass(name)} animation="slam">
          {name}
        </Hero>
      }
      note={`Título y artista · ${points} ${points === 1 ? 'punto' : 'puntos'}`}
      actions={
        <>
          <button
            onClick={() => view.judge(true)}
            className="btn btn-yes px-[clamp(2rem,4vw,4.5rem)] py-[clamp(1rem,1.8vw,1.8rem)] text-[clamp(1rem,1.6vw,1.6rem)]"
          >
            <span aria-hidden className="text-[1.4em] leading-none">
              ✓
            </span>
            Acertó
          </button>
          <button
            onClick={() => view.judge(false)}
            className="btn btn-no px-[clamp(2rem,4vw,4.5rem)] py-[clamp(1rem,1.8vw,1.8rem)] text-[clamp(1rem,1.6vw,1.6rem)]"
          >
            <span aria-hidden className="text-[1.4em] leading-none">
              ✕
            </span>
            Falló
          </button>
        </>
      }
    />
  )
}
