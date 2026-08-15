'use client'

import type { Phase } from '@/game/types'
import { Hero, StagePanel } from '@/host/ui/StagePanel'
import { UndoButton } from '@/host/ui/UndoButton'
import { playerName, type HostView } from '@/host/ui/hostView'
import {
  heroSizeClass,
  revealDetail,
  revealHeadline,
  roundLabel,
} from '@/host/ui/stagePresentation'

/**
 * The card turned over. The title is the protagonist; the year gets its own
 * weight because guessing decades out loud is half the fun of the game.
 *
 * The verdict sits between them and is the thing this screen was missing: the
 * room can see the card and still have no idea whether anybody got it, who
 * scored, or whether the clock simply ran out. The colour already says it —
 * green, red, or neutral — but colour alone does not name the person.
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
  const winner = playerName(view, phase.winnerId)

  return (
    <StagePanel
      kicker={roundLabel(view.state.roundsPlayed, view.state.roundsTotal)}
      hero={
        <>
          <p
            className="verdict enter enter-1"
            // Bigger than a kicker and smaller than the title: the room reads
            // it on the way to the card, not instead of it.
          >
            {revealHeadline(phase.outcome, winner)}
          </p>
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
        <span className="flex flex-col items-center gap-2">
          {song && song.year !== 0 ? (
            <span className="hero hero-sm block" style={{ opacity: 0.9 }}>
              {song.year}
            </span>
          ) : null}
          <span>{revealDetail(phase.outcome, winner)}</span>
        </span>
      }
      actions={
        <>
          <button
            onClick={() => view.dispatch({ type: 'NEXT_ROUND' })}
            className="btn btn-primary px-[clamp(2rem,4vw,4rem)] py-[clamp(0.9rem,1.6vw,1.6rem)] text-[clamp(1rem,1.7vw,1.75rem)]"
          >
            Siguiente canción
          </button>
          <UndoButton view={view} />
        </>
      }
    />
  )
}
