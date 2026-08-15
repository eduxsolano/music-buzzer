'use client'

import { useEffect, useRef, useState } from 'react'

/** How long the button admits it did something before going back to normal. */
const CONFIRMATION_MS = 2_000

/**
 * How long a clipboard write is given before it is treated as a failure.
 *
 * Not paranoia: `navigator.clipboard.writeText` can sit unresolved forever
 * when the browser is waiting on a permission decision nobody is there to
 * make. Observed while driving this page under automation, and the visible
 * result is the exact thing this component exists to prevent — a button that
 * does nothing, with no way to tell that from a click that missed. On a
 * timeout the link is shown in full so it can still be read out.
 */
const COPY_TIMEOUT_MS = 1_500

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(id))
  })
}

type Outcome = 'idle' | 'copied' | 'shared' | 'failed'

/**
 * Handing somebody the join link.
 *
 * Two devices, two different right answers, and the difference is the whole
 * point of this component:
 *
 * - **The television** is a laptop. It has no system share sheet, so a button
 *   labelled "compartir" would open nothing at all — worse than no button.
 *   It copies, and it says so, because a copy that gives no feedback is
 *   indistinguishable from a click that missed.
 * - **The host's phone** has a share sheet, which is how a link actually
 *   reaches somebody's WhatsApp. When it does not (a desktop browser, an
 *   iframe without permission, a user who dismissed the sheet), it falls back
 *   to copying rather than failing.
 *
 * When even the clipboard is unavailable — it needs a secure context — the
 * link is shown in full so it can be read out or typed. Never a dead end.
 */
export function ShareLink({
  url,
  allowShare = false,
  className = '',
}: {
  url: string
  /** Offer the native share sheet first. Only true where one plausibly exists. */
  allowShare?: boolean
  className?: string
}) {
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const announce = (next: Outcome) => {
    setOutcome(next)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    // A failure keeps the link on screen until it is dismissed by another
    // press: the host needs time to read it out.
    if (next === 'failed') return
    timeoutRef.current = setTimeout(() => setOutcome('idle'), CONFIRMATION_MS)
  }

  const act = async () => {
    if (allowShare && typeof navigator.share === 'function') {
      try {
        // Deliberately not raced against a timeout: the share sheet stays open
        // for as long as the host takes to pick a chat, and that wait is the
        // feature. Only the clipboard, which no human is looking at, gets one.
        await navigator.share({ title: 'Entra a la partida', url })
        announce('shared')
        return
      } catch {
        // Dismissing the sheet lands here too, so fall through to copying
        // rather than reporting a failure the host did not cause.
      }
    }
    try {
      await withTimeout(navigator.clipboard.writeText(url), COPY_TIMEOUT_MS)
      announce('copied')
    } catch {
      // Includes the case where there is no clipboard at all: served over
      // plain http on a local address, `navigator.clipboard` is undefined and
      // this throws before anything is awaited.
      announce('failed')
    }
  }

  const label =
    outcome === 'copied'
      ? '¡Enlace copiado!'
      : outcome === 'shared'
        ? 'Enlace compartido'
        : outcome === 'failed'
          ? 'Copia el enlace a mano'
          : allowShare
            ? 'Compartir enlace'
            : 'Copiar enlace'

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => void act()}
        aria-live="polite"
        className={`btn btn-ghost ${className}`}
        data-done={outcome === 'copied' || outcome === 'shared'}
      >
        {label}
      </button>
      {outcome === 'failed' ? (
        <code className="max-w-full break-all text-xs" style={{ color: 'var(--text-mid)' }}>
          {url}
        </code>
      ) : null}
    </div>
  )
}
