'use client'

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { GameEvent, GameState, Song } from '@/game/types'
import { Scoreboard } from '@/host/ui/Scoreboard'
import { TierMeter } from '@/host/ui/TierMeter'
import { KeyboardFallback } from '@/host/ui/KeyboardFallback'
import { PairingChip, PairingOverlay } from '@/host/ui/PairingPanel'
import { LobbyPanel } from '@/host/ui/phases/LobbyPanel'
import { WaitingPanel } from '@/host/ui/phases/WaitingPanel'
import { PlayingPanel } from '@/host/ui/phases/PlayingPanel'
import { BuzzedPanel } from '@/host/ui/phases/BuzzedPanel'
import { RevealedPanel } from '@/host/ui/phases/RevealedPanel'
import { FinishedPanel } from '@/host/ui/phases/FinishedPanel'
import type { HostView } from '@/host/ui/hostView'
import { moodFor, tierClockFor, type Judgement } from '@/host/ui/stagePresentation'
import { playCue } from '@/sounds/gameSounds'

export interface HostGameApi {
  room: string
  /** The pairing secret for the host's phone. Null only before the page settles. */
  controlToken: string | null
  panelPaired: boolean
  state: GameState
  song: Song | null
  audioReady: boolean
  channelError: string | null
  /** The green or red beat the room is being shown, if any. */
  judgement: Judgement | null
  canUndo: boolean
  dispatch: (event: GameEvent) => void
  judge: (correct: boolean) => void
  undo: () => void
  startGame: () => void
  newGame: () => void
}

/**
 * The projected screen.
 *
 * Composition, not conditionals: the shell owns the frame that never moves —
 * the tier meter, the room code, the scoreboard rail — and hands the middle
 * of the television to exactly one phase panel. Every panel fills the same
 * four slots of `StagePanel`, so **adding a phase is three edits**: a panel
 * file, a `case` in `phaseStage()` below, and (if it wants its own colour) a
 * `Mood` in `stagePresentation.ts` with a `[data-mood]` block in
 * `globals.css`. Nothing else has to move.
 */
export function HostStage({ game }: { game: HostGameApi }) {
  const {
    room,
    controlToken,
    panelPaired,
    state,
    song,
    audioReady,
    channelError,
    judgement,
    canUndo,
    dispatch,
    judge,
    undo,
    startGame,
    newGame,
  } = game

  // Owned here rather than inside the pairing components because two parts of
  // the screen have to agree on it: while the pairing code is up, the lobby
  // must not also be showing the join QR. One piece of state, two readers, no
  // way for the two codes to end up on the television together.
  const [pairingOpen, setPairingOpen] = useState(false)

  // The buzzer cue belongs to the room, not to the phone: it fires here, on
  // the speaker, in the silence the cut music just left behind. Comparing
  // against the previous phase keeps a host reload mid-buzz from replaying it.
  const previousPhaseKind = useRef(state.phase.kind)
  useEffect(() => {
    const previous = previousPhaseKind.current
    previousPhaseKind.current = state.phase.kind
    if (state.phase.kind === 'buzzed' && previous !== 'buzzed') playCue('buzz')
  }, [state.phase.kind])

  const scoreboard = useMemo(
    () => [...state.players].sort((a, b) => b.score - a.score),
    [state.players],
  )

  // Read at render rather than passed in: the page renders nothing until the
  // room exists, which only happens in an effect, so this always runs in the
  // browser and can never differ from what the server rendered.
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  const view: HostView = {
    room,
    origin,
    state,
    song,
    audioReady,
    scoreboard,
    canUndo,
    pairingOpen,
    dispatch,
    startGame,
    judge,
    undo,
    newGame,
  }

  const phase = state.phase
  const tierClock = tierClockFor(phase)

  return (
    <main
      data-mood={moodFor(phase, judgement)}
      className="stage grid min-h-dvh grid-cols-1 lg:grid-cols-[1fr_clamp(15rem,20vw,24rem)]"
    >
      <section className="relative flex min-h-dvh flex-col lg:min-h-0">
        <TierMeter tier={tierClock.tier} elapsedMs={tierClock.elapsedMs} />

        <header className="flex items-center justify-between gap-4 p-[clamp(1rem,1.6vw,2rem)]">
          <span className="chip">
            Sala <strong style={{ letterSpacing: '0.18em', color: 'var(--text-hi)' }}>{room}</strong>
          </span>
          <div className="flex items-center gap-3">
            {channelError ? (
              <span className="chip" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {channelError}
              </span>
            ) : null}
            {controlToken ? (
              <PairingChip
                paired={panelPaired}
                open={pairingOpen}
                onToggle={() => setPairingOpen((open) => !open)}
                inviting={phase.kind === 'lobby'}
              />
            ) : null}
          </div>
        </header>

        {phaseStage(view)}

        <KeyboardFallback
          players={state.players}
          dispatch={dispatch}
          showRegistration={phase.kind === 'lobby'}
        />
      </section>

      <Scoreboard players={scoreboard} lockedOut={state.lockedOut} />

      {/* Last in the tree and opaque: while the pairing code is up it is the
          only thing on the television, and the only square anybody can scan. */}
      {pairingOpen && controlToken ? (
        <PairingOverlay
          origin={origin}
          token={controlToken}
          onClose={() => setPairingOpen(false)}
        />
      ) : null}
    </main>
  )
}

/**
 * One phase, one panel.
 *
 * The `ReactElement` return type is what makes the switch exhaustive, and it
 * is not decoration: without it TypeScript infers `… | undefined`, a missing
 * arm compiles happily, and a new phase renders a blank television in the
 * middle of a party. `ReactNode` would not do either — it includes
 * `undefined`. With this annotation a phase without a panel fails on TS2366.
 */
function phaseStage(view: HostView): ReactElement {
  const phase = view.state.phase
  switch (phase.kind) {
    case 'lobby':
      return <LobbyPanel view={view} />
    case 'waiting':
      return <WaitingPanel view={view} phase={phase} />
    case 'playing':
      return <PlayingPanel view={view} phase={phase} />
    case 'buzzed':
      return <BuzzedPanel view={view} phase={phase} />
    case 'revealed':
      return <RevealedPanel view={view} phase={phase} />
    case 'finished':
      return <FinishedPanel view={view} />
  }
}
