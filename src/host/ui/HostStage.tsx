'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameEvent, GameState, Song } from '@/game/types'
import { Scoreboard } from '@/host/ui/Scoreboard'
import { TierMeter } from '@/host/ui/TierMeter'
import { KeyboardFallback } from '@/host/ui/KeyboardFallback'
import { LobbyPanel } from '@/host/ui/phases/LobbyPanel'
import { PlayingPanel } from '@/host/ui/phases/PlayingPanel'
import { BuzzedPanel } from '@/host/ui/phases/BuzzedPanel'
import { RevealedPanel } from '@/host/ui/phases/RevealedPanel'
import { FinishedPanel } from '@/host/ui/phases/FinishedPanel'
import type { HostView } from '@/host/ui/hostView'
import { moodFor, type Judgement } from '@/host/ui/stagePresentation'
import { playCue, unlockGameSounds } from '@/sounds/gameSounds'

/** How long the room stays green or red before the game moves on. */
const JUDGEMENT_FLASH_MS = 900

export interface HostGameApi {
  room: string
  state: GameState
  song: Song | null
  audioReady: boolean
  channelError: string | null
  dispatch: (event: GameEvent) => void
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
  const { room, state, song, audioReady, channelError, dispatch, startGame, newGame } = game
  const [judgement, setJudgement] = useState<Judgement | null>(null)

  // The flash is a beat, not a state: a ❌ drops the game straight back into
  // `playing`, so without this the room would never see the red.
  useEffect(() => {
    if (!judgement) return
    const id = setTimeout(() => setJudgement(null), JUDGEMENT_FLASH_MS)
    return () => clearTimeout(id)
  }, [judgement])

  const start = useCallback(() => {
    // The one guaranteed user gesture on this page. Web Audio refuses to make
    // a sound before one, so the context is created here rather than on load.
    unlockGameSounds()
    startGame()
  }, [startGame])

  const judge = useCallback(
    (correct: boolean) => {
      unlockGameSounds()
      playCue(correct ? 'correct' : 'wrong')
      setJudgement(correct ? 'correct' : 'wrong')
      dispatch({ type: 'JUDGE', correct })
    },
    [dispatch],
  )

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

  const view: HostView = {
    room,
    state,
    song,
    audioReady,
    scoreboard,
    dispatch,
    startGame: start,
    judge,
    newGame,
  }

  const phase = state.phase
  // A buzz freezes the tier rather than ending it, so the meter freezes with
  // it — the room can see exactly how much of the tier was left when the
  // music cut.
  const inTier = phase.kind === 'playing' || phase.kind === 'buzzed'
  const runningTier = inTier ? phase.tier : null
  const elapsedMs = inTier ? phase.elapsedMs : 0

  return (
    <main
      data-mood={moodFor(phase, judgement)}
      className="stage grid min-h-dvh grid-cols-1 lg:grid-cols-[1fr_clamp(15rem,20vw,24rem)]"
    >
      <section className="relative flex min-h-dvh flex-col lg:min-h-0">
        <TierMeter tier={runningTier} elapsedMs={elapsedMs} />

        <header className="flex items-center justify-between gap-4 p-[clamp(1rem,1.6vw,2rem)]">
          <span className="chip">
            Sala <strong style={{ letterSpacing: '0.18em', color: 'var(--text-hi)' }}>{room}</strong>
          </span>
          {channelError ? (
            <span className="chip" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {channelError}
            </span>
          ) : null}
        </header>

        {phaseStage(view)}

        <KeyboardFallback
          players={state.players}
          dispatch={dispatch}
          showRegistration={phase.kind === 'lobby'}
        />
      </section>

      <Scoreboard players={scoreboard} lockedOut={state.lockedOut} />
    </main>
  )
}

/**
 * One phase, one panel. The switch is exhaustive over `Phase['kind']`, so a
 * new phase in the engine fails to compile until it is given a panel here.
 */
function phaseStage(view: HostView) {
  const phase = view.state.phase
  switch (phase.kind) {
    case 'lobby':
      return <LobbyPanel view={view} />
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
