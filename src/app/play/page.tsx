'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { PublicState } from '@/game/publicState'
import { parseHostMessage } from '@/realtime/messages'
import type { Channel } from '@/realtime/channel'
import { createSupabaseChannel } from '@/realtime/supabaseChannel'
import { buttonState, loadIdentity, saveName } from '@/play/playerIdentity'
import { BUTTON_PRESENTATION } from '@/play/buttonPresentation'
import { BuzzerRing } from '@/play/BuzzerRing'
import { PULSE_MS, displayedRemainingMs, ringFraction, shouldPulse } from '@/play/countdown'
import { playCue, unlockGameSounds } from '@/sounds/gameSounds'
import { Confetti } from '@/ui/Confetti'

const CHANNEL_ERROR_MESSAGE = 'No hay conexión con Supabase. Revisa las variables de entorno.'

// How often the local countdown redraws. The host is not asked for the time;
// this only re-renders from a remainder the phone already has. Deliberately
// coarse — the ring carries a CSS transition of the same length, so five
// steps a second render as continuous motion at a fraction of the cost.
const COUNTDOWN_REDRAW_MS = 200

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
  // The last STATE **and when it landed**, kept together on purpose: the
  // countdown it carries was measured on the host at the instant it was sent,
  // so the number is meaningless without the moment it arrived. Storing them
  // apart would let one update without the other.
  const [received, setReceived] = useState<{ state: PublicState; at: number } | null>(null)
  const state = received?.state ?? null
  const [channelError, setChannelError] = useState<string | null>(null)
  const channelRef = useRef<Channel | null>(null)
  // 0 so the very first re-announce (e.g. right after reconnecting) is never
  // delayed — only the repeats afterward are throttled.
  const lastRejoinRef = useRef(0)
  // Exists only to redraw the countdown; the value is the wall clock the
  // countdown is measured against. The host's clock stays on the host.
  const [now, setNow] = useState(0)

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
          if (message?.type !== 'STATE') return
          setReceived({ state: message.state, at: Date.now() })
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

  // Only a sounding tier drains, so the timer only runs while the host says a
  // song is playing. Restarted on every message, so a fresh remainder always
  // wins over whatever this phone had been counting.
  const running = state?.phase === 'playing'
  const sentRemainingMs = state?.remainingMs ?? null
  useEffect(() => {
    if (!running || received?.state.remainingMs == null) return
    const id = setInterval(() => setNow(Date.now()), COUNTDOWN_REDRAW_MS)
    return () => clearInterval(id)
  }, [running, received])

  // `now` starts at 0 and lags one interval behind a fresh message, so the
  // elapsed span can come out negative; `displayedRemainingMs` clamps it and
  // the phone simply shows the full remainder until the first redraw.
  const remainingMs = displayedRemainingMs(sentRemainingMs, now - (received?.at ?? 0), running)

  // Three seconds left, one short pulse, in the pocket or in the hand. The
  // phone already knows the time — it has been running this countdown itself
  // since the last message — so this costs the shared channel nothing.
  //
  // The flag is cleared whenever the clock stops rather than when a tier
  // changes, because that is the honest boundary: every run of the clock
  // earns exactly one pulse, including the tail of a tier picked back up
  // after a wrong answer.
  const pulsedRef = useRef(false)
  useEffect(() => {
    if (!running) {
      pulsedRef.current = false
      return
    }
    if (!shouldPulse(remainingMs, running, status === 'armed', pulsedRef.current)) return
    pulsedRef.current = true
    navigator.vibrate?.(PULSE_MS)
  }, [running, remainingMs, status])

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
  const points = state?.pointsAtStake ?? null
  // Only where a press can still earn something. On a locked or eliminated
  // phone the stakes are somebody else's business, and a number nobody can
  // act on is noise.
  const showStakes = status === 'armed' && points !== null
  // Null between tiers, and that is the point: there is no clock to draw
  // then, and any ring drawn anyway would be making one up.
  const ring = showStakes
    ? ringFraction(remainingMs, state?.tierDurationMs ?? null, running)
    : null

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: 'var(--ink-0)' }}>
      {status === 'celebrating' ? <Confetti pieces={40} /> : null}
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
        {/* The breath invites a press while nothing is running. Once the ring
            is draining it takes over as the live element, and two things
            moving on one button is one too many. */}
        <span
          aria-hidden
          className={`pad-ring ${presentation.motion === 'breathe' && ring === null ? 'breathe' : ''}`}
        />
        {ring === null ? null : <BuzzerRing fraction={ring} />}
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
        {/* The one number left on this screen, because it is the one decision:
            press now for this, or hold out for the title you almost have. The
            seconds are texture and the ring carries them. */}
        {showStakes ? (
          <span className="relative flex items-baseline gap-2">
            <span className="pad-points tabular-nums">{points}</span>
            <span className="text-base opacity-75">
              {points === 1 ? 'punto' : 'puntos'}
            </span>
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
