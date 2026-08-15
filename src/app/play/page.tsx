'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { PublicState } from '@/game/publicState'
import { parseHostMessage } from '@/realtime/messages'
import type { Channel } from '@/realtime/channel'
import { createSupabaseChannel } from '@/realtime/supabaseChannel'
import { buttonState, loadIdentity, saveName } from '@/play/playerIdentity'
import { BUTTON_PRESENTATION } from '@/play/buttonPresentation'
import { playCue, unlockGameSounds } from '@/sounds/gameSounds'

const CHANNEL_ERROR_MESSAGE = 'No hay conexión con Supabase. Revisa las variables de entorno.'

// The host may broadcast STATE far more often than once per rejoin window (e.g.
// every 50ms while a song plays), so this must not re-announce on every message —
// that would flood the shared channel every other phone in the room listens to.
const REJOIN_INTERVAL_MS = 2_000

/** A dark room, 30 cm from a face: same palette as the stage, far less light. */
function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="stage flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="note max-w-xs">{children}</p>
    </main>
  )
}

function PlayScreen() {
  const room = (useSearchParams().get('sala') ?? '').toUpperCase()
  const [identity, setIdentity] = useState<{ playerId: string; name: string | null } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [state, setState] = useState<PublicState | null>(null)
  const [channelError, setChannelError] = useState<string | null>(null)
  const channelRef = useRef<Channel | null>(null)
  // 0 so the very first re-announce (e.g. right after reconnecting) is never
  // delayed — only the repeats afterward are throttled.
  const lastRejoinRef = useRef(0)

  useEffect(() => {
    // localStorage is only available client-side; reading it in an effect
    // (rather than a lazy useState initializer) keeps server and first
    // client render identical, avoiding a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdentity(loadIdentity(window.localStorage))
  }, [])

  useEffect(() => {
    if (!room || !identity?.name) return
    let closed = false
    let channel: Channel
    try {
      channel = createSupabaseChannel(room)
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChannelError(CHANNEL_ERROR_MESSAGE)
      return
    }
    channelRef.current = channel

    void (async () => {
      try {
        await channel.subscribe((raw) => {
          const message = parseHostMessage(raw)
          if (message?.type === 'STATE') setState(message.state)
        })
        if (closed) return
        await channel.publish({ type: 'JOIN', playerId: identity.playerId, name: identity.name })
      } catch {
        if (!closed) setChannelError(CHANNEL_ERROR_MESSAGE)
      }
    })()

    return () => {
      closed = true
      void channel.close()
      channelRef.current = null
    }
  }, [room, identity?.playerId, identity?.name])

  // Self-healing: if the host does not know us (it restarted, or our JOIN was
  // lost), announce ourselves again while we are missing from its state. This
  // must not depend on the host being well-behaved about broadcast rate, so
  // retries are throttled to REJOIN_INTERVAL_MS regardless of how often STATE
  // arrives — otherwise a host broadcasting at, say, 20Hz would turn a single
  // missing player into 20 JOIN publishes a second on a channel every other
  // phone in the room is listening to.
  useEffect(() => {
    if (!state || !identity?.name) return
    if (state.players.some((p) => p.id === identity.playerId)) return
    if (Date.now() - lastRejoinRef.current < REJOIN_INTERVAL_MS) return
    lastRejoinRef.current = Date.now()
    void channelRef.current?.publish({
      type: 'JOIN',
      playerId: identity.playerId,
      name: identity.name,
    })
  }, [state, identity?.playerId, identity?.name])

  const status = useMemo(
    () => buttonState(state, identity?.playerId ?? ''),
    [state, identity?.playerId],
  )

  const buzz = useCallback(() => {
    if (status !== 'armed' || !identity) return
    navigator.vibrate?.(60)
    // The press is a gesture, so this is a legal moment to make sound. The cue
    // that matters is the one on the host speaker; this one is just for the
    // thumb that pressed.
    unlockGameSounds()
    playCue('buzz')
    void channelRef.current?.publish({ type: 'BUZZ', playerId: identity.playerId })
  }, [status, identity])

  if (!room) return <Message>Falta el código de sala. Escanea el QR otra vez.</Message>

  if (!identity) return null

  if (channelError) return <Message>{channelError}</Message>

  if (!identity.name) {
    return (
      <main className="stage flex min-h-dvh flex-col justify-center gap-6 p-7">
        <div className="flex flex-col gap-2">
          <span className="kicker">Sala {room}</span>
          <h1 className="hero hero-sm">Tu nombre</h1>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const name = draftName.trim()
            if (!name) return
            // First certain gesture on this phone: get the audio context out of
            // its suspended state now, not in the middle of a round.
            unlockGameSounds()
            saveName(window.localStorage, name)
            setIdentity({ ...identity, name })
          }}
        >
          <input
            autoFocus
            maxLength={18}
            className="rounded-2xl px-5 py-4 text-2xl font-semibold outline-none"
            style={{
              background: 'var(--ink-1)',
              color: 'var(--text-hi)',
              border: '1px solid var(--line)',
            }}
            placeholder="Cómo te llaman"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <button className="btn btn-primary px-6 py-4 text-lg" disabled={draftName.trim() === ''}>
            Entrar
          </button>
        </form>
        <p className="text-sm" style={{ color: 'var(--text-low)' }}>
          Se queda guardado en este celular: si se bloquea, vuelves con tus puntos.
        </p>
      </main>
    )
  }

  const me = state?.players.find((p) => p.id === identity.playerId)
  const presentation = BUTTON_PRESENTATION[status]

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: 'var(--ink-0)' }}>
      <header
        className="flex items-baseline justify-between px-5 py-3 text-sm"
        style={{ color: 'var(--text-low)' }}
      >
        <span className="max-w-[45%] truncate font-semibold">{identity.name}</span>
        {state ? (
          <span className="tabular-nums">
            {state.roundsPlayed}/{state.roundsTotal}
          </span>
        ) : null}
        <span className="font-display text-2xl tabular-nums" style={{ color: 'var(--text-mid)' }}>
          {me?.score ?? 0}
        </span>
      </header>

      <button
        type="button"
        onPointerDown={buzz}
        disabled={status !== 'armed'}
        data-state={status}
        className="pad flex-1"
      >
        <span
          aria-hidden
          className={`pad-ring ${presentation.motion === 'breathe' ? 'breathe' : ''}`}
        />
        {presentation.motion === 'burst' ? (
          <span key={status} className="pad-ring burst" aria-hidden />
        ) : null}
        <span
          className={`pad-label ${status === 'eliminated' ? 'line-through' : ''}`}
          style={{ fontSize: 'clamp(3rem,17vw,6rem)' }}
        >
          {presentation.label}
        </span>
        {presentation.hint ? (
          <span className="relative max-w-[16rem] text-base leading-snug opacity-80">
            {presentation.hint}
          </span>
        ) : null}
      </button>
    </div>
  )
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayScreen />
    </Suspense>
  )
}
