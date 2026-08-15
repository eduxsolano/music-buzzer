import { beforeEach, describe, expect, test } from 'vitest'
import { createDoubleBufferedPlayer, type YouTubePlayer } from '@/audio/youtubePlayer'

class SpyPlayer implements YouTubePlayer {
  readonly calls: string[] = []
  loadedVideoId: string | null = null

  load(videoId: string, startSeconds: number): void {
    this.loadedVideoId = videoId
    this.calls.push(`load:${videoId}@${startSeconds}`)
  }
  seekTo(seconds: number): void {
    this.calls.push(`seek:${seconds}`)
  }
  play(): void {
    this.calls.push('play')
  }
  pause(): void {
    this.calls.push('pause')
  }
  mute(): void {
    this.calls.push('mute')
  }
  unMute(): void {
    this.calls.push('unmute')
  }
}

describe('double-buffered player', () => {
  let a: SpyPlayer
  let b: SpyPlayer

  beforeEach(() => {
    a = new SpyPlayer()
    b = new SpyPlayer()
  })

  function player() {
    return createDoubleBufferedPlayer(() => [a, b])
  }

  test('preloading buffers silently: muted, played, then paused', async () => {
    await player().preload('vid1', 10)
    expect(a.calls).toEqual(['mute', 'load:vid1@10', 'play', 'pause', 'seek:10'])
  })

  test('playing a preloaded song reuses that buffer instead of reloading', async () => {
    const p = player()
    await p.preload('vid1', 10)
    a.calls.length = 0
    await p.play('vid1', 10)
    expect(a.calls).toEqual(['unmute', 'seek:10', 'play'])
    expect(a.calls).not.toContain('load:vid1@10')
  })

  test('playing an unbuffered song loads it on the spot', async () => {
    await player().play('surprise', 0)
    expect(a.calls).toEqual(['unmute', 'load:surprise@0', 'seek:0', 'play'])
  })

  test('the next song preloads into the other buffer while one is active', async () => {
    const p = player()
    await p.play('vid1', 0)
    await p.preload('vid2', 5)
    expect(b.loadedVideoId).toBe('vid2')
    expect(a.loadedVideoId).toBe('vid1')
  })

  test('replaying the active song restarts it from the start point', async () => {
    const p = player()
    await p.play('vid1', 12)
    a.calls.length = 0
    await p.play('vid1', 12) // el tramo siguiente reinicia la canción
    expect(a.calls).toEqual(['unmute', 'seek:12', 'play'])
  })

  test('pause and resume act on the active buffer only', async () => {
    const p = player()
    await p.play('vid1', 0)
    a.calls.length = 0
    p.pause()
    p.resume()
    expect(a.calls).toEqual(['pause', 'play'])
    expect(b.calls).toEqual([])
  })

  test('stop pauses the active buffer', async () => {
    const p = player()
    await p.play('vid1', 0)
    a.calls.length = 0
    p.stop()
    expect(a.calls).toEqual(['pause'])
  })
})
