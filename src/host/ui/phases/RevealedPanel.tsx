'use client'

import type { Phase } from '@/game/types'
import { Hero, StagePanel } from '@/host/ui/StagePanel'
import { playerName, type HostView } from '@/host/ui/hostView'
import { heroSizeClass, revealHeadline } from '@/host/ui/stagePresentation'

/**
 * The card turned over. The title is the protagonist; the year gets its own
 * weight because guessing decades out loud is half the fun of the game.
 */
export function RevealedPanel({
  view,
  phase,
}: {
  view: HostView
  phase: Extract<Phase, { kind: 'revealed' }>
}) {
  const song = view.song
  const title = song?.title ?? 'Canción desconocida'

  return (
    <StagePanel
      kicker={revealHeadline(phase.outcome, playerName(view, phase.winnerId))}
      hero={
        <>
          <Hero sizeClass={heroSizeClass(title)}>{title}</Hero>
          <p
            className="enter enter-1 text-[clamp(1.25rem,2.6vw,2.75rem)] font-semibold"
            style={{ color: 'var(--text-hi)' }}
          >
            {song?.artist}
          </p>
        </>
      }
      note={
        song && song.year !== 0 ? (
          <span className="hero hero-sm block" style={{ opacity: 0.9 }}>
            {song.year}
          </span>
        ) : null
      }
      actions={
        <button
          onClick={() => view.dispatch({ type: 'NEXT_ROUND' })}
          className="btn btn-primary px-[clamp(2rem,4vw,4rem)] py-[clamp(0.9rem,1.6vw,1.6rem)] text-[clamp(1rem,1.7vw,1.75rem)]"
        >
          Siguiente canción
        </button>
      }
    />
  )
}
