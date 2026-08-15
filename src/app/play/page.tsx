'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { PublicState } from '@/game/publicState'
import { parseHostMessage } from '@/realtime/messages'
import type { Channel } from '@/realtime/channel'
import { createSupabaseChannel } from '@/realtime/supabaseChannel'
import { buttonState, loadIdentity, saveName } from '@/play/playerIdentity'

const BUTTON_STYLES: Record<ReturnType<typeof buttonState>, string> = {
  waiting: 'bg-slate-700 text-slate-400',
  armed: 'bg-emerald-500 text-emerald-950 active:bg-emerald-400',
  locked: 'bg-slate-700 text-slate-400',
  eliminated: 'bg-rose-800 text-rose-200',
}

const BUTTON_LABELS: Record<ReturnType<typeof buttonState>, string> = {
  waiting: 'Conectando…',
  armed: '¡PULSA!',
  locked: 'Espera',
  eliminated: 'Fuera de esta canción',
}

// The host may broadcast STATE far more often than once per rejoin window (e.g.
// every 50ms while a song plays), so this must not re-announce on every message —
// that would flood the shared channel every other phone in the room listens to.
const REJOIN_INTERVAL_MS = 2_000

function PlayScreen() {
  const room = (useSearchParams().get('sala') ?? '').toUpperCase()
  const [identity, setIdentity] = useState<{ playerId: string; name: string | null } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [state, setState] = useState<PublicState | null>(null)
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
    const channel = createSupabaseChannel(room)
    channelRef.current = channel

    void (async () => {
      await channel.subscribe((raw) => {
        const message = parseHostMessage(raw)
        if (message?.type === 'STATE') setState(message.state)
      })
      if (closed) return
      await channel.publish({ type: 'JOIN', playerId: identity.playerId, name: identity.name })
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
    void channelRef.current?.publish({ type: 'BUZZ', playerId: identity.playerId })
  }, [status, identity])

  if (!room) {
    return <p className="p-8 text-slate-200">Falta el código de sala. Escanea el QR otra vez.</p>
  }

  if (!identity) return null

  if (!identity.name) {
    return (
      <form
        className="flex min-h-dvh flex-col justify-center gap-4 p-8"
        onSubmit={(event) => {
          event.preventDefault()
          const name = draftName.trim()
          if (!name) return
          saveName(window.localStorage, name)
          setIdentity({ ...identity, name })
        }}
      >
        <h1 className="text-2xl font-bold text-slate-100">Sala {room}</h1>
        <input
          autoFocus
          className="rounded-xl bg-slate-800 p-4 text-xl text-slate-100"
          placeholder="Tu nombre"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
        <button className="rounded-xl bg-emerald-500 p-4 text-xl font-bold text-emerald-950">
          Entrar
        </button>
      </form>
    )
  }

  const me = state?.players.find((p) => p.id === identity.playerId)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-baseline justify-between p-4 text-slate-300">
        <span className="text-lg font-semibold">{identity.name}</span>
        <span className="text-2xl font-bold tabular-nums">{me?.score ?? 0}</span>
      </header>
      <button
        onPointerDown={buzz}
        disabled={status !== 'armed'}
        className={`flex-1 text-5xl font-black tracking-tight transition-colors ${BUTTON_STYLES[status]}`}
      >
        {BUTTON_LABELS[status]}
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
