'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ControlPanel } from '@/control/ui/ControlPanel'
import { useControlPanel } from '@/control/useControlPanel'
import { isControlToken } from '@/host/pairing'

const CHANNEL_ERROR_MESSAGE = 'No hay conexión con Supabase. Revisa las variables de entorno.'

/** Same dark ground as everything else, for the states with nothing to show. */
function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="stage flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="note max-w-xs">{children}</p>
    </main>
  )
}

/**
 * The host's control panel.
 *
 * Reached only by scanning the pairing QR on the television: the URL carries a
 * 128-bit secret and nothing else — no room code, nothing derived from one —
 * and that secret is the name of the channel this page talks on. A player who
 * knows the room is no closer to this screen than a stranger is.
 */
function ControlScreen() {
  const raw = useSearchParams().get('t')
  // A malformed token is refused before it becomes a channel name: subscribing
  // to whatever was in the query string could otherwise put this page on a
  // channel somebody else chose.
  const token = isControlToken(raw) ? raw : null
  const { state, failed, send } = useControlPanel(token)

  if (!token) return <Message>Falta el código de emparejamiento. Escanea el QR de la tele otra vez.</Message>
  if (failed) return <Message>{CHANNEL_ERROR_MESSAGE}</Message>
  if (!state) return <Message>Buscando la tele…</Message>

  return (
    <ControlPanel
      state={state}
      send={send}
      origin={typeof window === 'undefined' ? '' : window.location.origin}
    />
  )
}

export default function ControlPage() {
  return (
    <Suspense>
      <ControlScreen />
    </Suspense>
  )
}
