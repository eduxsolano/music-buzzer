'use client'

import { useEffect, useState } from 'react'
import { ControlPanel } from '@/control/ui/ControlPanel'
import { useControlPanel } from '@/control/useControlPanel'
import { tokenFromHash } from '@/host/pairing'

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
 * Reached only by scanning the pairing QR on the television. The URL carries a
 * 128-bit secret and nothing else — no room code, nothing derived from one —
 * and that secret is the name of the channel this page talks on. A player who
 * knows the room is no closer to this screen than a stranger is.
 *
 * The secret lives in the **fragment**, which is why this reads
 * `location.hash` in an effect rather than through `useSearchParams`: a
 * fragment never leaves the browser, so the token stays out of server access
 * logs entirely. Reading it in an effect also keeps the server render and the
 * first client render identical — the hash does not exist during
 * prerendering — so there is no hydration mismatch.
 */
export default function ControlPage() {
  // `undefined` means "not looked yet", null means "looked, nothing usable".
  // The difference matters: rendering the "scan it again" message for one
  // frame before the hash has been read would be a lie.
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const { state, failed, send } = useControlPanel(token ?? null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(tokenFromHash(window.location.hash))
  }, [])

  if (token === undefined) return null
  if (!token) {
    return <Message>Falta el código de emparejamiento. Escanea el QR de la tele otra vez.</Message>
  }
  if (failed) return <Message>{CHANNEL_ERROR_MESSAGE}</Message>
  if (!state) return <Message>Buscando la tele…</Message>

  return <ControlPanel state={state} send={send} origin={window.location.origin} />
}
