import { createClient } from '@supabase/supabase-js'
import type { Channel, MessageHandler } from '@/realtime/channel'

const EVENT = 'game'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } })
}

/**
 * Broadcast-only channel. No tables, no RLS: messages are relayed and forgotten.
 * `self: false` keeps a sender from receiving its own messages back.
 */
export function createSupabaseChannel(room: string): Channel {
  return channelNamed(`sala:${room}`)
}

/**
 * The private line between the television and the host's phone.
 *
 * A Supabase channel is a shared room: everybody subscribed to `sala:KZTR`
 * receives everything published on it, so the song title cannot travel there.
 * This channel is named after a 128-bit secret instead (see
 * `src/host/pairing.ts`), which is what makes it unreachable from a room code
 * — the two names have nothing in common.
 */
export function createControlChannel(token: string): Channel {
  return channelNamed(`panel:${token}`)
}

function channelNamed(name: string): Channel {
  const channel = client().channel(name, {
    config: { broadcast: { self: false } },
  })

  return {
    async publish(message: unknown): Promise<void> {
      await channel.send({ type: 'broadcast', event: EVENT, payload: message })
    },

    async subscribe(handler: MessageHandler): Promise<void> {
      channel.on('broadcast', { event: EVENT }, ({ payload }) => handler(payload))
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve()
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            reject(new Error(`Supabase channel failed: ${status}`))
          }
        })
      })
    },

    async close(): Promise<void> {
      await channel.unsubscribe()
    },
  }
}
