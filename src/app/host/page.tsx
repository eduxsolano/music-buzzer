'use client'

import { useCallback, useEffect, useState } from 'react'
import type { GameEvent } from '@/game/types'
import { KEYBOARD_KEYS, eventForKey, keyboardPlayerId } from '@/host/keyboardPlayers'
import QRCode from 'qrcode'
import { YouTubeStage } from '@/audio/youtubeIframes'
import { pointsForTier } from '@/game/tiers'
import { parseSongs } from '@/songs/schema'
import rawSongs from '@/songs/songs.json'
import { useHostGame } from '@/host/useHostGame'

const songs = parseSongs(rawSongs)

function JoinQr({ room }: { room: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const url = `${window.location.origin}/play?sala=${room}`
    void QRCode.toDataURL(url, { width: 420, margin: 1 }).then(setDataUrl)
  }, [room])

  // eslint-disable-next-line @next/next/no-img-element
  return dataUrl ? <img src={dataUrl} alt={`Unirse a la sala ${room}`} className="rounded-xl" /> : null
}

function KeyboardFallback({
  dispatch,
  showRegistration,
}: {
  dispatch: (event: GameEvent) => void
  showRegistration: boolean
}) {
  const [keys, setKeys] = useState<string[]>([])

  const register = useCallback(
    (key: string, name: string) => {
      dispatch({ type: 'JOIN', playerId: keyboardPlayerId(key), name })
      setKeys((previous) => (previous.includes(key) ? previous : [...previous, key]))
    },
    [dispatch],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const gameEvent = eventForKey(event.key, keys)
      if (gameEvent) dispatch(gameEvent)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keys, dispatch])

  // Registration only makes sense in the lobby, but the key listener above must
  // stay mounted for the whole game — that is when the keys are actually used.
  if (!showRegistration) return null

  return (
    <details className="mt-6 text-left text-slate-400">
      <summary className="cursor-pointer text-sm uppercase tracking-widest">
        Sin wifi: jugar con teclado
      </summary>
      <div className="mt-3 space-y-2">
        {KEYBOARD_KEYS.map((key) => (
          <form
            key={key}
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement
              const name = input.value.trim()
              if (name) register(key, name)
              input.value = ''
            }}
          >
            <span className="w-10 rounded bg-slate-800 text-center font-mono uppercase">{key}</span>
            <input name="name" placeholder="Nombre" className="flex-1 rounded bg-slate-800 px-2" />
            <button className="rounded bg-slate-700 px-3">Asignar</button>
          </form>
        ))}
      </div>
    </details>
  )
}

export default function HostPage() {
  const { room, state, song, audioReady, dispatch, startGame, attachAudio, newGame } =
    useHostGame(songs)
  if (!room) return null

  const scoreboard = [...state.players].sort((a, b) => b.score - a.score)
  const phase = state.phase
  const buzzer =
    phase.kind === 'buzzed' ? state.players.find((p) => p.id === phase.playerId) : undefined

  return (
    <main className="grid min-h-dvh grid-cols-[1fr_20rem] bg-slate-950 text-slate-100">
      <YouTubeStage onReady={attachAudio} />

      <section className="flex flex-col items-center justify-center gap-8 p-10 text-center">
        {state.phase.kind === 'lobby' && (
          <>
            <h1 className="text-6xl font-black">Sala {room}</h1>
            <JoinQr room={room} />
            <p className="text-xl text-slate-400">
              {state.players.length} jugador{state.players.length === 1 ? '' : 'es'} conectado
              {state.players.length === 1 ? '' : 's'}
            </p>
            <button
              onClick={startGame}
              disabled={state.players.length === 0 || !audioReady}
              className="rounded-2xl bg-emerald-500 px-10 py-5 text-2xl font-bold text-emerald-950 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {audioReady ? 'Empezar partida' : 'Cargando audio…'}
            </button>
          </>
        )}

        {state.phase.kind === 'playing' && (
          <>
            <p className="text-2xl text-slate-400">
              Canción {state.roundsPlayed} de {state.roundsTotal}
            </p>
            <p className="text-[10rem] font-black leading-none">
              {pointsForTier(state.phase.tier)}
            </p>
            <p className="text-3xl text-slate-400">puntos en juego</p>
            <button onClick={() => dispatch({ type: 'SKIP_SONG' })} className="text-slate-500 underline">
              Saltar canción
            </button>
          </>
        )}

        {state.phase.kind === 'buzzed' && (
          <>
            <p className="text-8xl font-black">{buzzer?.name}</p>
            <p className="text-2xl text-slate-400">
              vale {pointsForTier(state.phase.tier)} puntos
            </p>
            <div className="flex gap-6">
              <button
                onClick={() => dispatch({ type: 'JUDGE', correct: true })}
                className="rounded-2xl bg-emerald-500 px-14 py-8 text-5xl font-bold text-emerald-950"
              >
                ✅
              </button>
              <button
                onClick={() => dispatch({ type: 'JUDGE', correct: false })}
                className="rounded-2xl bg-rose-600 px-14 py-8 text-5xl font-bold text-rose-50"
              >
                ❌
              </button>
            </div>
          </>
        )}

        {state.phase.kind === 'revealed' && (
          <>
            <p className="text-6xl font-black">{song?.title}</p>
            <p className="text-4xl text-slate-300">{song?.artist}</p>
            <p className="text-8xl font-black text-emerald-400">{song?.year}</p>
            <button
              onClick={() => dispatch({ type: 'NEXT_ROUND' })}
              className="rounded-2xl bg-emerald-500 px-10 py-5 text-2xl font-bold text-emerald-950"
            >
              Siguiente canción
            </button>
          </>
        )}

        {state.phase.kind === 'finished' && (
          <>
            <h1 className="text-6xl font-black">Fin de la partida</h1>
            <p className="text-4xl text-emerald-400">Gana {scoreboard[0]?.name}</p>
            <button onClick={newGame} className="rounded-2xl bg-emerald-500 px-10 py-5 text-2xl font-bold text-emerald-950">
              Nueva partida
            </button>
          </>
        )}

        <KeyboardFallback dispatch={dispatch} showRegistration={state.phase.kind === 'lobby'} />
      </section>

      <aside className="border-l border-slate-800 p-6">
        <h2 className="mb-4 text-sm uppercase tracking-widest text-slate-500">Marcador</h2>
        <ul className="space-y-3">
          {scoreboard.map((player) => (
            <li
              key={player.id}
              className={`flex justify-between text-2xl ${
                state.lockedOut.includes(player.id) ? 'text-slate-600 line-through' : ''
              }`}
            >
              <span>{player.name}</span>
              <span className="font-bold tabular-nums">{player.score}</span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  )
}
