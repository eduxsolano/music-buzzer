'use client'

import { StagePanel } from '@/host/ui/StagePanel'
import { QrCard } from '@/host/ui/QrCard'
import { ShareLink } from '@/ui/ShareLink'
import { joinUrl } from '@/host/pairing'
import type { HostView } from '@/host/ui/hostView'
import { playersConnectedLabel } from '@/host/ui/stagePresentation'

/** Before the music: the room code and the QR are the only two things to do. */
export function LobbyPanel({ view }: { view: HostView }) {
  const { room, state, audioReady, startGame, origin, pairingOpen } = view

  return (
    <StagePanel
      kicker="Escanea para entrar"
      hero={
        <div className="flex flex-wrap items-center justify-center gap-[clamp(2rem,5vw,5rem)]">
          {/* Never while the pairing code is up. The overlay already covers
              this, and this is the second, independent reason the room can
              never be looking at both squares at once — see PairingPanel. */}
          {pairingOpen ? null : (
            <QrCard url={joinUrl(origin, room)} alt={`Unirse a la sala ${room}`} />
          )}
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
            {/* A laptop has no share sheet, so this copies and says so. The
                phone that is too far from the television to scan gets the link
                pasted into a chat instead. */}
            <ShareLink url={joinUrl(origin, room)} className="px-5 py-2.5 text-xs" />
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
