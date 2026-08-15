'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_ROUNDS } from '@/game/config'
import { currentSong, initialState, reduce } from '@/game/reducer'
import { toPublicState } from '@/game/publicState'
import { createRoomCode, shuffle } from '@/game/random'
import type { GameEvent, GameState, Song } from '@/game/types'
import type { AudioPlayer } from '@/audio/audioPlayer'
import type { Channel } from '@/realtime/channel'
import { parsePlayerMessage } from '@/realtime/messages'
import { createSupabaseChannel } from '@/realtime/supabaseChannel'
import { clearGame, loadGame, saveGame } from '@/host/persistence'
import { audioActionFor, snapshot, type AudioSnapshot } from '@/host/audioTransitions'

const TICK_MS = 50

export function useHostGame(songs: Song[]) {
  const [room, setRoom] = useState<string | null>(null)
  const [state, setState] = useState<GameState>(initialState)
  // Starting before the iframes exist would play a silent round.
  const [audioReady, setAudioReady] = useState(false)
  const audioRef = useRef<AudioPlayer | null>(null)
  const channelRef = useRef<Channel | null>(null)

  // Restore after a reload, or mint a fresh room. localStorage and
  // Math.random are only meaningful client-side, so this has to run in an
  // effect (not a lazy useState initializer) to keep the server and first
  // client render identical and avoid a hydration mismatch.
  useEffect(() => {
    const saved = loadGame(window.localStorage)
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoom(saved.room)
      setState(saved.state)
    } else {
      setRoom(createRoomCode(Math.random))
    }
  }, [])

  const dispatch = useCallback((event: GameEvent) => {
    setState((previous) => reduce(previous, event))
  }, [])

  // Persist on every change: cheap, local, and it's the safety net against an
  // accidental reload mid-party, so every tick genuinely wants to hit it.
  //
  // Broadcasting is different: the clock ticks every 50ms (20/s), and the
  // Supabase channel is capped at 20 events/s system-wide for the whole room.
  // toPublicState deliberately drops elapsedMs, so consecutive public states
  // are equal in value on every tick while a song plays even though `state`
  // changes identity each time. Publish only when the projection actually
  // changed, or we saturate the channel with no-op STATE messages and force
  // every phone's self-healing re-announce to fire at the same 20Hz. Do NOT
  // "simplify" this back to publishing on every state change.
  const lastPublishedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!room) return
    saveGame(window.localStorage, room, state)

    const publicState = toPublicState(state)
    const serialized = JSON.stringify(publicState)
    if (serialized === lastPublishedRef.current) return
    lastPublishedRef.current = serialized
    void channelRef.current?.publish({ type: 'STATE', state: publicState })
  }, [room, state])

  // Listen to the phones. The host decides the winner by arrival order:
  // the reducer ignores every BUZZ after the first.
  useEffect(() => {
    if (!room) return
    const channel = createSupabaseChannel(room)
    channelRef.current = channel

    void channel.subscribe((raw) => {
      const message = parsePlayerMessage(raw)
      if (!message) return
      if (message.type === 'JOIN') {
        dispatch({ type: 'JOIN', playerId: message.playerId, name: message.name })
      } else {
        dispatch({ type: 'BUZZ', playerId: message.playerId })
      }
    })

    return () => {
      void channel.close()
      channelRef.current = null
    }
  }, [room, dispatch])

  // The engine owns the clock; the player just obeys.
  useEffect(() => {
    if (state.phase.kind !== 'playing') return
    const id = setInterval(() => dispatch({ type: 'TICK', deltaMs: TICK_MS }), TICK_MS)
    return () => clearInterval(id)
  }, [state.phase.kind, dispatch])

  const song = useMemo(() => currentSong(state, songs), [state, songs])

  // Audio follows the TRANSITION, not the phase: only that tells "start tier 2"
  // apart from "come back to tier 2 after a wrong answer".
  const previousSnapshot = useRef<AudioSnapshot>({ kind: 'lobby', tier: null })
  useEffect(() => {
    const next = snapshot(state.phase)
    const action = audioActionFor(previousSnapshot.current, next)
    previousSnapshot.current = next

    const audio = audioRef.current
    if (!audio) return
    if (action === 'play' && song) void audio.play(song.videoId, song.startSeconds)
    if (action === 'resume') audio.resume()
    if (action === 'pause') audio.pause()
    if (action === 'stop') audio.stop()
  }, [state.phase, song])

  // Buffer the next song while this one plays, so there is no dead air.
  useEffect(() => {
    const next = songs.find((s) => s.id === state.deck[0])
    if (next) void audioRef.current?.preload(next.videoId, next.startSeconds)
  }, [state.deck, songs])

  const startGame = useCallback(() => {
    const deck = shuffle(
      songs.map((s) => s.id),
      Math.random,
    )
    dispatch({
      type: 'START_GAME',
      deck,
      roundsTotal: Math.min(DEFAULT_ROUNDS, deck.length),
    })
  }, [songs, dispatch])

  const attachAudio = useCallback((player: AudioPlayer) => {
    audioRef.current = player
    setAudioReady(true)
  }, [])

  const newGame = useCallback(() => {
    clearGame(window.localStorage)
    window.location.reload()
  }, [])

  return { room, state, song, audioReady, dispatch, startGame, attachAudio, newGame }
}
