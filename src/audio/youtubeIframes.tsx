'use client'

import { useEffect, useRef } from 'react'
import type { AudioPlayer } from '@/audio/audioPlayer'
import { createDoubleBufferedPlayer, type YouTubePlayer } from '@/audio/youtubePlayer'

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement, options: Record<string, unknown>) => YtApiPlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface YtApiPlayer {
  loadVideoById(options: { videoId: string; startSeconds: number }): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  mute(): void
  unMute(): void
}

function loadIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  return new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
}

function createApiPlayer(element: HTMLElement): Promise<YtApiPlayer> {
  return new Promise((resolve) => {
    const player = new window.YT!.Player(element, {
      height: '1',
      width: '1',
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
      events: { onReady: () => resolve(player) },
    })
  })
}

function adapt(player: YtApiPlayer): YouTubePlayer {
  return {
    load: (videoId, startSeconds) => player.loadVideoById({ videoId, startSeconds }),
    seekTo: (seconds) => player.seekTo(seconds, true),
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    mute: () => player.mute(),
    unMute: () => player.unMute(),
  }
}

/**
 * Mounts the two hidden iframes the double buffer drives and hands the ready
 * AudioPlayer back to the host page.
 */
export function YouTubeStage({ onReady }: { onReady: (player: AudioPlayer) => void }) {
  const slotA = useRef<HTMLDivElement>(null)
  const slotB = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false
    void (async () => {
      await loadIframeApi()
      if (cancelled || !slotA.current || !slotB.current) return
      const a = adapt(await createApiPlayer(slotA.current))
      const b = adapt(await createApiPlayer(slotB.current))
      if (cancelled) return
      onReady(createDoubleBufferedPlayer(() => [a, b]))
    })()

    return () => {
      cancelled = true
    }
  }, [onReady])

  return (
    <div aria-hidden className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
      <div ref={slotA} />
      <div ref={slotB} />
    </div>
  )
}
