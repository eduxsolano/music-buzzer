'use client'

import { useState } from 'react'
import { QrCard } from '@/host/ui/QrCard'
import { controlUrl } from '@/host/pairing'

/**
 * The pairing corner of the television.
 *
 * The host has to judge answers before the song is revealed, which means the
 * answer has to be somewhere — and it cannot be here, because the whole room
 * is looking at this screen. So it goes to the host's own phone, and this is
 * how that phone is let in: a QR carrying a secret nobody could guess, shown
 * only for as long as it takes to scan.
 *
 * It comes up by itself while the game is being set up and goes away the
 * moment a panel answers, because the one real exposure in this design is
 * somebody photographing the code off the screen. That is accepted among
 * friends — but there is no reason to leave it up all evening, and no reason
 * to make the host hunt for it if their phone dies mid-game either, which is
 * why the chip stays.
 */
export function PairingPanel({
  origin,
  token,
  paired,
  showByDefault,
}: {
  origin: string
  token: string
  paired: boolean
  /** True while the game is being set up: the QR is the point then. */
  showByDefault: boolean
}) {
  // Null means "do whatever the game is doing"; a press pins it either way.
  const [pinned, setPinned] = useState<boolean | null>(null)
  const open = pinned ?? (showByDefault && !paired)

  return (
    <div className="relative flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setPinned(!open)}
        className="chip"
        style={paired ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined}
      >
        {paired ? 'Panel conectado' : 'Panel del anfitrión'}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-20 mt-2 flex w-max flex-col items-center gap-3 rounded-2xl p-4"
          style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}
        >
          <QrCard
            url={controlUrl(origin, token)}
            alt="Emparejar el panel del anfitrión"
            size="sm"
          />
          <p className="max-w-[14rem] text-center text-xs" style={{ color: 'var(--text-mid)' }}>
            Escanéalo solo tú: abre el panel con las respuestas en tu celular.
          </p>
          <button type="button" onClick={() => setPinned(false)} className="btn btn-ghost px-4 py-2 text-xs">
            Ocultar
          </button>
        </div>
      ) : null}
    </div>
  )
}
