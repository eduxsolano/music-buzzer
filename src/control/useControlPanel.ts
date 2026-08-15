'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseControlMessage, type ControlAction } from '@/control/controlMessages'
import type { ControlState } from '@/control/controlState'
import type { Channel } from '@/realtime/channel'
import { createControlChannel } from '@/realtime/supabaseChannel'

/**
 * The panel's half of the private line.
 *
 * This runs on a phone in a pocket. It will be locked, unlocked, backgrounded
 * and reconnected all evening, so — exactly like the player page — it never
 * assumes the last thing it heard is still true. It announces itself and asks
 * to be told everything again:
 *
 * - on subscribing;
 * - every time the tab becomes visible again, which is precisely the moment a
 *   phone comes out of a pocket and the host is about to press something;
 * - on a slow repeat while nothing has ever arrived, in case the very first
 *   greeting was lost.
 *
 * The repeat stops the instant a state lands, so a paired panel is not a
 * source of traffic. This channel is the host's alone: the players never see
 * it, and no volume here can affect the room's channel.
 */
const HELLO_RETRY_MS = 3_000

export function useControlPanel(token: string | null) {
  const [state, setState] = useState<ControlState | null>(null)
  const [failed, setFailed] = useState(false)
  const channelRef = useRef<Channel | null>(null)

  const hello = useCallback(() => {
    void channelRef.current?.publish({ type: 'HELLO' })
  }, [])

  useEffect(() => {
    if (!token) return
    let closed = false
    let channel: Channel
    try {
      channel = createControlChannel(token)
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true)
      return
    }
    channelRef.current = channel

    void (async () => {
      try {
        await channel.subscribe((raw) => {
          const message = parseControlMessage(raw)
          if (!message) return
          setState(message.state)
        })
        if (closed) return
        await channel.publish({ type: 'HELLO' })
      } catch {
        if (!closed) setFailed(true)
      }
    })()

    return () => {
      closed = true
      void channel.close()
      channelRef.current = null
    }
  }, [token])

  // Nothing has ever arrived: the greeting, or the television, was not there.
  // Keep asking, slowly, and stop the moment an answer lands.
  useEffect(() => {
    if (!token || state) return
    const id = setInterval(hello, HELLO_RETRY_MS)
    return () => clearInterval(id)
  }, [token, state, hello])

  // The phone was locked. Whatever the room did meanwhile, ask for it now
  // rather than showing the host a screen that is quietly minutes old.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') hello()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [hello])

  const send = useCallback((action: ControlAction) => {
    // A short tick under the thumb: the host is looking at the room, not at
    // the phone, and needs to know the tap registered.
    navigator.vibrate?.(15)
    void channelRef.current?.publish(action)
  }, [])

  return { state, failed, send }
}
