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
  const channel = client().channel(`sala:${room}`, {
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
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
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
