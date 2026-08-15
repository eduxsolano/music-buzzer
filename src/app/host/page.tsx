'use client'

import { YouTubeStage } from '@/audio/youtubeIframes'
import { HostStage } from '@/host/ui/HostStage'
import { useHostGame } from '@/host/useHostGame'
import { parseSongs } from '@/songs/schema'
import rawSongs from '@/songs/songs.json'

const songs = parseSongs(rawSongs)

/**
 * The laptop, projected on a television. This page is deliberately nothing
 * but wiring: the game lives in `useHostGame`, the screen in `HostStage`.
 */
export default function HostPage() {
  const { room, state, song, audioReady, channelError, dispatch, startGame, attachAudio, newGame } =
    useHostGame(songs)
  if (!room) return null

  return (
    <>
      <YouTubeStage onReady={attachAudio} />
      <HostStage
        game={{ room, state, song, audioReady, channelError, dispatch, startGame, newGame }}
      />
    </>
  )
}
