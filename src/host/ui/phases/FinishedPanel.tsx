'use client'

import { Hero, StagePanel } from '@/host/ui/StagePanel'
import type { HostView } from '@/host/ui/hostView'
import { finalNote, finalStanding, heroSizeClass } from '@/host/ui/stagePresentation'
import { Confetti } from '@/ui/Confetti'

/**
 * The end of the night: one name in gold, paper falling, and a way to start
 * again — unless several people are level, in which case the screen says so
 * and names them. Crowning whoever happened to sort first is the kind of
 * mistake a room notices immediately and never lets go of; there is no
 * tie-break round, and the game does not pretend there is one.
 */
export function FinishedPanel({ view }: { view: HostView }) {
  const standing = finalStanding(view.scoreboard)
  const hero =
    standing.kind === 'winner' ? standing.name : standing.kind === 'tie' ? 'Empate' : 'Nadie'

  return (
    <>
      {/* Only when somebody actually played: an empty game gets the gold
          screen, not a celebration. A tie is still worth celebrating. */}
      {standing.kind === 'nobody' ? null : <Confetti />}
      <StagePanel
        kicker={standing.kind === 'tie' ? 'Nadie se lleva la partida' : 'Fin de la partida'}
        hero={
          <Hero sizeClass={heroSizeClass(hero)} animation="slam">
            {hero}
          </Hero>
        }
        note={finalNote(standing)}
        actions={
          <button
            onClick={view.newGame}
            className="btn btn-primary px-[clamp(2rem,4vw,4rem)] py-[clamp(0.9rem,1.6vw,1.6rem)] text-[clamp(1rem,1.7vw,1.75rem)]"
          >
            Nueva partida
          </button>
        }
      />
    </>
  )
}
