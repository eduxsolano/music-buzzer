export type MessageHandler = (message: unknown) => void

/** The whole surface the game needs from a realtime provider. */
export interface Channel {
  publish(message: unknown): Promise<void>
  subscribe(handler: MessageHandler): Promise<void>
  close(): Promise<void>
}

/** In-memory channel for tests: no network, fully synchronous delivery. */
export class FakeChannel implements Channel {
  readonly published: unknown[] = []
  private handlers: MessageHandler[] = []
  private closed = false

  async publish(message: unknown): Promise<void> {
    if (this.closed) return
    this.published.push(message)
    for (const handler of this.handlers) handler(message)
  }

  async subscribe(handler: MessageHandler): Promise<void> {
    this.handlers.push(handler)
  }

  async close(): Promise<void> {
    this.closed = true
    this.handlers = []
  }
}
