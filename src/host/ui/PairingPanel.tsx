'use client'

import { QrCard } from '@/host/ui/QrCard'
import { controlUrl } from '@/host/pairing'

/**
 * Letting the host's own phone in.
 *
 * The host has to judge answers before the song is revealed, which means the
 * answer has to be somewhere — and it cannot be on this screen, because the
 * whole room is looking at it. So it goes to the host's own phone, and this is
 * the door: a QR carrying a secret nobody could guess.
 *
 * **The one rule this file exists to enforce: the pairing QR is never on
 * screen at the same time as the join QR.** It used to open by itself for the
 * whole lobby, which put the private door beside the public one at the single
 * moment of the evening when every phone in the room is pointed at the
 * television with a camera open, having just been told to scan. A guest who
 * scanned the wrong square would have got the answers to every song — and not
 * read-only either, since a paired panel can judge, undo and skip — while the
 * host watched the chip turn green and concluded their own scan had worked.
 * There is no revocation short of starting a new game.
 *
 * So it does not open by itself at all. The chip is the affordance, and
 * opening it takes the whole stage: `PairingOverlay` covers everything,
 * including the join QR, which `LobbyPanel` also stops rendering. Two
 * independent reasons the two codes cannot be photographed together, rather
 * than one z-index.
 */
export function PairingChip({
  paired,
  open,
  onToggle,
  inviting,
}: {
  paired: boolean
  open: boolean
  onToggle: () => void
  /** True in the lobby before pairing: the chip is a thing to do, not a status. */
  inviting: boolean
}) {
  const style = paired
    ? { borderColor: 'var(--green)', color: 'var(--green)' }
    : inviting
      ? { borderColor: 'var(--stage-accent)', color: 'var(--stage-accent)' }
      : undefined

  return (
    <button type="button" onClick={onToggle} className="chip" style={style} aria-expanded={open}>
      {paired ? 'Panel conectado' : 'Panel del anfitrión'}
    </button>
  )
}

/**
 * The pairing code, alone on the television.
 *
 * Opaque and full-bleed on purpose: while this is up there is exactly one
 * scannable square in the room, and it is this one. It comes down on
 * `Ocultar`, and the chip brings it back — which is also the recovery path
 * when the host's phone dies in the middle of a game.
 */
export function PairingOverlay({
  origin,
  token,
  onClose,
}: {
  origin: string
  token: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(1rem,3vh,2.5rem)] p-8 text-center"
      // Deliberately NOT the `.stage` class: that sets `position: relative`,
      // and being defined after Tailwind's utilities it wins the cascade — the
      // overlay laid itself out in the document flow and the join QR stayed
      // visible above it. Found by looking at the television, not by reading.
      // Opaque, and the ground colour still comes from the mood on <main>.
      style={{ background: 'var(--stage-ground)' }}
    >
      <p className="kicker">Panel del anfitrión</p>
      <QrCard url={controlUrl(origin, token)} alt="Emparejar el panel del anfitrión" />
      <p className="note max-w-md">
        Escanéalo solo tú. Abre en tu celular el panel con las respuestas y los botones para juzgar.
      </p>
      <button type="button" onClick={onClose} className="btn btn-primary px-8 py-4 text-base">
        Ya lo escaneé
      </button>
    </div>
  )
}
