'use client'

import { Hero, StagePanel } from '@/host/ui/StagePanel'
import type { HostView } from '@/host/ui/hostView'
import { heroSizeClass } from '@/host/ui/stagePresentation'

/** The end of the night: one name, in gold, and a way to start again. */
export function FinishedPanel({ view }: { view: HostView }) {
  const winner = view.scoreboard[0]
  const tied = winner ? view.scoreboard.filter((p) => p.score === winner.score) : []
  const name = tied.length > 1 ? 'Empate' : (winner?.name ?? 'Nadie')

  return (
    <StagePanel
      kicker="Fin de la partida"
      hero={
        <Hero sizeClass={heroSizeClass(name)} animation="slam">
          {name}
        </Hero>
      }
      note={
        winner
          ? `${winner.score} ${Math.abs(winner.score) === 1 ? 'punto' : 'puntos'}`
          : 'Sin jugadores'
      }
      actions={
        <button
          onClick={view.newGame}
          className="btn btn-primary px-[clamp(2rem,4vw,4rem)] py-[clamp(0.9rem,1.6vw,1.6rem)] text-[clamp(1rem,1.7vw,1.75rem)]"
        >
          Nueva partida
        </button>
      }
    />
  )
}
