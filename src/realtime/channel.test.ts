import { describe, expect, test, vi } from 'vitest'
import { FakeChannel } from '@/realtime/channel'

describe('FakeChannel', () => {
  test('delivers published messages to subscribers', async () => {
    const channel = new FakeChannel()
    const received: unknown[] = []
    await channel.subscribe((message) => received.push(message))
    await channel.publish({ type: 'BUZZ', playerId: 'p1' })
    expect(received).toEqual([{ type: 'BUZZ', playerId: 'p1' }])
  })

  test('records everything published, so tests can assert on traffic', async () => {
    const channel = new FakeChannel()
    await channel.publish({ type: 'BUZZ', playerId: 'p1' })
    expect(channel.published).toEqual([{ type: 'BUZZ', playerId: 'p1' }])
  })

  test('stops delivering once closed', async () => {
    const channel = new FakeChannel()
    const handler = vi.fn()
    await channel.subscribe(handler)
    await channel.close()
    await channel.publish({ type: 'BUZZ', playerId: 'p1' })
    expect(handler).not.toHaveBeenCalled()
  })
})
