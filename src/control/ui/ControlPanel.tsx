'use client'

import type { ControlState } from '@/control/controlState'
import type { ControlAction } from '@/control/controlMessages'
import {
  controlLaunchLabel,
  controlMood,
  controlPrompt,
  stakeLabel,
} from '@/control/controlPresentation'
import { joinUrl } from '@/host/pairing'
import { revealDetail } from '@/host/ui/stagePresentation'
import { ShareLink } from '@/ui/ShareLink'

/**
 * The host's phone.
 *
 * It exists for one reason: the person judging has to know the answer before
 * the room does, and the television cannot tell them. So this screen is the
 * card — title, artist, year — plus the buttons that were previously only
 * beside the laptop.
 *
 * It is a phone held in a dark room while its owner talks to six people, so
 * the design is the same stage as everywhere else at a fraction of the light:
 * mood colour first, one big answer, and every control in the bottom third
 * where a thumb reaches. Nothing here is small enough to need a second look.
 */
export function ControlPanel({
  state,
  send,
  origin,
}: {
  state: ControlState
  send: (action: ControlAction) => void
  origin: string
}) {
  const launch = controlLaunchLabel(state)
  const stakes = stakeLabel(state.pointsAtStake)

  return (
    <main
      data-mood={controlMood(state.phase, state.outcome)}
      className="stage flex min-h-dvh flex-col justify-between gap-4 p-5"
    >
      <header className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--text-low)' }}>
        <span className="chip">Sala {state.room}</span>
        <span className="tabular-nums">
          {state.roundsPlayed}/{state.roundsTotal}
        </span>
      </header>

      <section className="flex flex-col items-center gap-3 text-center">
        <p className="kicker">{controlPrompt(state)}</p>

        {state.song ? (
          <>
            <h1 className="hero hero-sm">{state.song.title}</h1>
            <p className="text-xl font-semibold" style={{ color: 'var(--text-hi)' }}>
              {state.song.artist}
            </p>
            {state.song.year !== 0 ? (
              <p className="font-display text-3xl" style={{ color: 'var(--text-mid)' }}>
                {state.song.year}
              </p>
            ) : null}
          </>
        ) : (
          <p className="note">{emptyMessage(state)}</p>
        )}

        {state.phase === 'revealed' ? (
          <p className="note">{revealDetail(state.outcome ?? 'skipped', state.winnerName)}</p>
        ) : stakes ? (
          <p className="note">{stakes}</p>
        ) : null}
      </section>

      <Standings players={state.players} />

      {/* The thumb zone. Every control the host needs lives here and nowhere
          else, so the hand never has to travel to find one. */}
      <footer className="flex flex-col gap-3">
        {state.phase === 'buzzed' ? (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => send({ type: 'JUDGE', correct: true })} className="btn btn-yes py-6 text-lg">
              ✓ Acertó
            </button>
            <button onClick={() => send({ type: 'JUDGE', correct: false })} className="btn btn-no py-6 text-lg">
              ✕ Falló
            </button>
          </div>
        ) : null}

        {launch ? (
          <button onClick={() => send({ type: 'LAUNCH_TIER' })} className="btn btn-primary py-6 text-lg">
            {launch}
          </button>
        ) : null}

        {state.phase === 'revealed' ? (
          <button onClick={() => send({ type: 'NEXT_ROUND' })} className="btn btn-primary py-6 text-lg">
            Siguiente canción
          </button>
        ) : null}

        {state.phase === 'lobby' ? (
          <ShareLink url={joinUrl(origin, state.room)} allowShare className="w-full py-4 text-sm" />
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {/* Undo is the reason this panel is worth carrying, and also the
              button that must never be hit on the way to another one: it is
              small, it is off to the side, and it is simply absent whenever
              there is nothing to take back. */}
          {state.canUndo ? (
            <button onClick={() => send({ type: 'UNDO' })} className="btn btn-ghost px-5 py-3 text-sm">
              ↺ Deshacer juicio
            </button>
          ) : (
            <span />
          )}
          {state.phase === 'waiting' || state.phase === 'playing' || state.phase === 'buzzed' ? (
            <button onClick={() => send({ type: 'SKIP_SONG' })} className="btn btn-ghost px-5 py-3 text-sm">
              Saltar canción
            </button>
          ) : null}
        </div>
      </footer>
    </main>
  )
}

function emptyMessage(state: ControlState): string {
  if (state.phase === 'finished') return 'La partida terminó'
  return 'Todavía no hay canción en juego'
}

/** Who is still in this song, and what everybody has. Quiet on purpose. */
function Standings({ players }: { players: ControlState['players'] }) {
  if (players.length === 0) return null
  const ranked = [...players].sort((a, b) => b.score - a.score)
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {ranked.map((player) => (
        <li
          key={player.id}
          className="flex items-baseline justify-between gap-3"
          style={{
            color: player.out ? 'var(--text-low)' : 'var(--text-mid)',
            textDecoration: player.out ? 'line-through' : undefined,
          }}
        >
          <span className="truncate">{player.name}</span>
          <span className="tabular-nums">{player.score}</span>
        </li>
      ))}
    </ul>
  )
}
