'use client'

import { useEffect, useRef, useState } from 'react'
import { parseControlCommand, type ControlAction } from '@/control/controlMessages'
import type { ControlState } from '@/control/controlState'
import type { Channel } from '@/realtime/channel'
import { createControlChannel } from '@/realtime/supabaseChannel'

/**
 * The television's half of the private line to the host's phone.
 *
 * Deliberately a second channel and a second effect rather than a branch
 * inside the public one. Two rules have to hold at once and mixing them is
 * exactly how one of them gets broken later:
 *
 * 1. Nothing identifying the song may reach `sala:KZTR`. Here the song is the
 *    payload, so this code must never touch that channel.
 * 2. The public channel's publish throttle must not be weakened. It is not
 *    touched at all — this hook has its own, on its own channel, with its own
 *    last-published record.
 */
export function useControlChannel(
  token: string | null,
  controlState: ControlState | null,
  onCommand: (action: ControlAction) => void,
): { paired: boolean } {
  // A count rather than a flag: the publish effect below depends on it, and a
  // second HELLO from a phone that just woke up has to re-run that effect to
  // answer. `setPaired(true)` on an already-true flag would change nothing and
  // the reply would wait for an unrelated state change — indefinitely, if the
  // game happens to be sitting in `waiting`.
  const [hellos, setHellos] = useState(0)
  const paired = hellos > 0
  const channelRef = useRef<Channel | null>(null)
  // Held in a ref so a new callback identity (it closes over `dispatch` and
  // the game state) never tears down and re-subscribes the channel. Written in
  // an effect rather than during render: a ref mutated while rendering is one
  // Strict Mode double-invocation away from being surprising.
  const onCommandRef = useRef(onCommand)
  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])

  // A HELLO is a request to be told everything, not a state change: a panel
  // that wakes up after the phone was locked usually finds the game exactly
  // where it left it, and the equality throttle below would swallow the reply.
  // Same shape as the phones' forced publish in `useHostGame`, for the same
  // reason, and bounded the same way — one forced publish per HELLO received.
  const forceNextPublishRef = useRef(false)
  const lastPublishedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token) return
    let channel: Channel
    try {
      channel = createControlChannel(token)
    } catch {
      // No Supabase configured. The television keeps its own controls, so the
      // game is still playable; the panel simply never pairs.
      return
    }
    channelRef.current = channel

    channel
      .subscribe((raw) => {
        const command = parseControlCommand(raw)
        if (!command) return
        // Anything arriving on this channel came from a panel, so anything
        // arriving is proof of pairing — not only a greeting. That matters
        // after the television is reloaded mid-game: the panel has no way to
        // know it happened, and without this the chip would keep claiming
        // nothing is paired while the host judges from their phone.
        setHellos((count) => count + 1)
        if (command.type === 'HELLO') {
          // A greeting is a request to be told everything, answered by the
          // publish effect below, which re-runs because the count changed.
          // Nothing is dispatched into the game.
          forceNextPublishRef.current = true
          return
        }
        onCommandRef.current(command)
      })
      .catch(() => {})

    return () => {
      void channel.close()
      channelRef.current = null
      lastPublishedRef.current = null
    }
  }, [token])

  useEffect(() => {
    const channel = channelRef.current
    if (!channel || !controlState) return
    const serialized = JSON.stringify(controlState)
    if (serialized === lastPublishedRef.current && !forceNextPublishRef.current) return
    lastPublishedRef.current = serialized
    forceNextPublishRef.current = false
    void channel.publish({ type: 'CONTROL_STATE', state: controlState })
  }, [controlState, hellos])

  return { paired }
}
