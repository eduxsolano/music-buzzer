import type { AudioPlayer } from '@/audio/audioPlayer'

/** The slice of the YouTube IFrame API this game needs. */
export interface YouTubePlayer {
  load(videoId: string, startSeconds: number): void
  seekTo(seconds: number): void
  play(): void
  pause(): void
  mute(): void
  unMute(): void
}

export type PlayerFactory = () => [YouTubePlayer, YouTubePlayer]

interface PlayerBuffer {
  player: YouTubePlayer
  videoId: string | null
}

/**
 * Two players taking turns: one sounds while the other silently buffers the
 * next song. Without this there is a dead second or two between songs.
 */
export function createDoubleBufferedPlayer(factory: PlayerFactory): AudioPlayer {
  const [first, second] = factory()
  const buffers: [PlayerBuffer, PlayerBuffer] = [
    { player: first, videoId: null },
    { player: second, videoId: null },
  ]
  let activeIndex = 0

  const active = () => buffers[activeIndex]
  const idle = () => buffers[activeIndex === 0 ? 1 : 0]

  return {
    async preload(videoId: string, startSeconds: number): Promise<void> {
      const buffer = active().videoId === null ? active() : idle()
      buffer.player.mute()
      buffer.player.load(videoId, startSeconds)
      buffer.player.play()
      buffer.player.pause()
      buffer.player.seekTo(startSeconds)
      buffer.videoId = videoId
    },

    async play(videoId: string, startSeconds: number): Promise<void> {
      if (active().videoId !== videoId && idle().videoId === videoId) {
        activeIndex = activeIndex === 0 ? 1 : 0
      }
      const buffer = active()
      buffer.player.unMute()
      if (buffer.videoId !== videoId) {
        buffer.player.load(videoId, startSeconds)
        buffer.videoId = videoId
      }
      buffer.player.seekTo(startSeconds)
      buffer.player.play()
    },

    pause(): void {
      active().player.pause()
    },

    resume(): void {
      active().player.play()
    },

    stop(): void {
      active().player.pause()
    },
  }
}
