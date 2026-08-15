'use client'

import { StagePanel } from '@/host/ui/StagePanel'
import { JoinQr } from '@/host/ui/JoinQr'
import type { HostView } from '@/host/ui/hostView'
import { playersConnectedLabel } from '@/host/ui/stagePresentation'

/** Before the music: the room code and the QR are the only two things to do. */
export function LobbyPanel({ view }: { view: HostView }) {
  const { room, state, audioReady, startGame } = view

  return (
    <StagePanel
      kicker="Escanea para entrar"
      hero={
        <div className="flex flex-wrap items-center justify-center gap-[clamp(2rem,5vw,5rem)]">
          <JoinQr room={room} />
          <div className="flex flex-col items-start gap-3">
            <span className="kicker">Sala</span>
            <div className="flex gap-[clamp(0.4rem,0.8vw,0.9rem)]">
              {[...room].map((letter, index) => (
                <span
                  key={`${letter}-${index}`}
                  className="hero grid place-items-center rounded-2xl px-[0.28em] pb-[0.06em] pt-[0.14em] text-[clamp(3rem,8vw,7rem)]"
                  style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,0.03)' }}
                >
                  {letter}
                </span>
              ))}
            </div>
          </div>
        </div>
      }
      note={playersConnectedLabel(state.players.length)}
      actions={
        <button
          onClick={startGame}
          disabled={state.players.length === 0 || !audioReady}
          className="btn btn-primary px-[clamp(2rem,4vw,4rem)] py-[clamp(0.9rem,1.6vw,1.6rem)] text-[clamp(1rem,1.7vw,1.75rem)]"
        >
          {audioReady ? 'Empezar partida' : 'Cargando audio…'}
        </button>
      }
    />
  )
}
