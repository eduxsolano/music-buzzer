'use client'

import { useState } from 'react'
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

  // A single tap must never wipe the room's scores, so a tap here only ever
  // opens the warning below; only the button inside it actually sends
  // NEW_SESSION. Closed on every phase change, which covers both the happy
  // path (the reset lands and the phase becomes `lobby`) and the host
  // changing their mind by pressing something else on the television
  // meanwhile. Adjusted during render rather than in an effect — this is
  // local UI state derived from a prop, not a subscription to anything
  // external, so there is nothing here for an effect to synchronize with.
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [phaseSeen, setPhaseSeen] = useState(state.phase)
  if (state.phase !== phaseSeen) {
    setPhaseSeen(state.phase)
    setConfirmingReset(false)
  }

  return (
    <main
      data-mood={controlMood(state.phase, state.outcome)}
      className="stage flex min-h-dvh flex-col justify-between gap-4 p-5"
    >
      <header
        className="flex items-center justify-between gap-2 text-xs"
        style={{ color: 'var(--text-low)' }}
      >
        <span className="chip shrink-0 whitespace-nowrap">Sala {state.room}</span>
        {/* Undo lives up here, as far from a resting thumb as this screen
            allows, and never in the column the judge and next-song buttons
            occupy. A control that rewinds the scoreboard must not be reachable
            by the same movement as the one that advances it. It is simply
            absent whenever there is nothing to take back.
            One caveat worth knowing before pressing it: it restores the state
            from immediately before the last judgement, so if somebody has
            buzzed again since, that buzz — and anybody who joined in the
            meantime — goes away with it. */}
        {state.canUndo ? (
          <button
            onClick={() => send({ type: 'UNDO' })}
            className="btn btn-ghost shrink-0 whitespace-nowrap px-4 py-2 text-xs"
          >
            ↺ Deshacer
          </button>
        ) : null}
        {/* Same reasoning as Undo above, for a control with far more to lose:
            up here, never beside the judge buttons a resting thumb rests
            near. Absent in the lobby — there is no game in progress yet to
            abandon, only "Empezar partida" below. */}
        {state.phase !== 'lobby' && !confirmingReset ? (
          <button
            onClick={() => setConfirmingReset(true)}
            className="btn btn-ghost shrink-0 whitespace-nowrap px-4 py-2 text-xs"
          >
            ⟲ Reiniciar
          </button>
        ) : null}
        <span className="tabular-nums">
          {state.roundsPlayed}/{state.roundsTotal}
        </span>
      </header>

      {confirmingReset ? (
        <ResetConfirm
          players={state.players}
          onCancel={() => setConfirmingReset(false)}
          onConfirm={() => send({ type: 'NEW_SESSION' })}
        />
      ) : (
        <ControlBody state={state} send={send} origin={origin} launch={launch} stakes={stakes} />
      )}
    </main>
  )
}

/**
 * The deliberate second step. Replaces the entire body below the header —
 * song, standings, judge buttons, everything — rather than floating over it,
 * so there is no live judge button anywhere near this screen while the host
 * decides. The standings are reprinted here on purpose, each score struck
 * through to zero: "reiniciar" is an abstract word, a list of named scores
 * about to disappear is not.
 */
function ResetConfirm({
  players,
  onCancel,
  onConfirm,
}: {
  players: ControlState['players']
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <p className="kicker" style={{ color: 'var(--red)' }}>
        ¿Reiniciar la partida?
      </p>
      <p className="note max-w-xs">
        Se borran todos los puntos y se pierde la canción en juego. La sala,
        el código y los jugadores siguen igual: nadie tiene que volver a
        escanear.
      </p>
      {players.length > 0 ? (
        <ul className="flex w-full max-w-xs flex-col gap-1 text-sm" style={{ color: 'var(--text-mid)' }}>
          {players.map((player) => (
            <li key={player.id} className="flex items-baseline justify-between gap-4">
              <span className="truncate">{player.name}</span>
              <span className="tabular-nums" style={{ color: 'var(--red)' }}>
                {player.score} → 0
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid w-full grid-cols-2 gap-3">
        <button onClick={onCancel} className="btn btn-ghost py-5 text-base">
          Cancelar
        </button>
        <button onClick={onConfirm} className="btn btn-no py-5 text-base">
          Sí, reiniciar
        </button>
      </div>
    </section>
  )
}

/**
 * Everything the panel shows outside the confirmation, unchanged from before
 * this control existed. Split out only so `confirmingReset` can swap the
 * whole body for the warning instead of layering a dialog over live judge
 * buttons — a stray tap through an overlay is exactly the accident a second,
 * deliberate step is supposed to rule out.
 */
function ControlBody({
  state,
  send,
  origin,
  launch,
  stakes,
}: {
  state: ControlState
  send: (action: ControlAction) => void
  origin: string
  launch: string | null
  stakes: string | null
}) {
  return (
    <>
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

        {state.phase === 'waiting' || state.phase === 'playing' || state.phase === 'buzzed' ? (
          <div className="flex justify-end">
            <button onClick={() => send({ type: 'SKIP_SONG' })} className="btn btn-ghost px-5 py-3 text-sm">
              Saltar canción
            </button>
          </div>
        ) : null}
      </footer>
    </>
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
