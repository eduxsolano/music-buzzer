export interface AudioPlayer {
  /** Buffers a song silently so the next `play` starts instantly. */
  preload(videoId: string, startSeconds: number): Promise<void>
  /** Seeks to `startSeconds` and plays. Restarting a tier calls this again. */
  play(videoId: string, startSeconds: number): Promise<void>
  pause(): void
  resume(): void
  stop(): void
}
