'use client'

import { useCallback, useEffect, useMemo } from 'react'
import type { GameEvent, Player } from '@/game/types'
import { KEYBOARD_KEYS, eventForKey, keyFromPlayerId, keyboardPlayerId } from '@/host/keyboardPlayers'

/**
 * The no-wifi escape hatch, tucked into a corner of the lobby: it must be
 * reachable in a crisis and invisible the rest of the time.
 */
export function KeyboardFallback({
  players,
  dispatch,
  showRegistration,
}: {
  players: Player[]
  dispatch: (event: GameEvent) => void
  showRegistration: boolean
}) {
  // Derived from the persisted players, not local state: the JOINs survive a
  // host reload (they live in state.players), but a useState here would not,
  // silently orphaning every keyboard buzzer for the rest of the game.
  const keys = useMemo(
    () => players.map((p) => keyFromPlayerId(p.id)).filter((key): key is string => key !== null),
    [players],
  )

  const register = useCallback(
    (key: string, name: string) => {
      dispatch({ type: 'JOIN', playerId: keyboardPlayerId(key), name })
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
    <details className="absolute bottom-6 left-[clamp(1.5rem,4vw,5rem)] max-w-sm text-left">
      <summary className="kicker cursor-pointer select-none">Sin wifi: jugar con teclado</summary>
      <div className="mt-4 flex flex-col gap-2">
        {KEYBOARD_KEYS.map((key) => (
          <form
            key={key}
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement
              const name = input.value.trim()
              if (name) register(key, name)
              input.value = ''
            }}
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-md font-mono text-sm uppercase"
              style={{ background: 'var(--ink-2)', color: 'var(--text-mid)' }}
            >
              {key}
            </span>
            <input
              name="name"
              placeholder="Nombre"
              className="h-9 flex-1 rounded-md px-3 text-sm outline-none"
              style={{ background: 'var(--ink-1)', color: 'var(--text-hi)' }}
            />
            <button
              className="h-9 rounded-md px-3 text-xs font-bold uppercase tracking-widest"
              style={{ background: 'var(--ink-2)', color: 'var(--text-mid)' }}
            >
              Asignar
            </button>
          </form>
        ))}
      </div>
    </details>
  )
}
