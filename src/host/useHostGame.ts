'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_ROUNDS, HISTORY_LIMIT, MIN_DECK_OPTION_SONGS } from '@/game/config'
import { buildDeck, recordRoundIfDecided } from '@/game/deck'
import {
  deckLabel,
  filterSongs,
  isOfferableSelection,
  offerableDeckAxes,
  type DeckSelection,
} from '@/game/deckFilters'
import { playlistNames } from '@/songs/playlists'
import { currentSong, initialState } from '@/game/reducer'
import { toPublicState, withCountdown } from '@/game/publicState'
import { createRoomCode } from '@/game/random'
import type { GameEvent, Song } from '@/game/types'
import type { AudioPlayer } from '@/audio/audioPlayer'
import type { Channel } from '@/realtime/channel'
import { parsePlayerMessage } from '@/realtime/messages'
import { createSupabaseChannel } from '@/realtime/supabaseChannel'
import { clearGame, loadGame, loadHistory, saveGame, saveHistory } from '@/host/persistence'
import { audioActionFor, snapshot, type AudioSnapshot } from '@/host/audioTransitions'
import { initialSession, step, undoJudgement, type HostSession } from '@/host/undo'
import { createControlToken } from '@/host/pairing'
import { useControlChannel } from '@/host/useControlChannel'
import { toControlState } from '@/control/controlState'
import type { ControlAction } from '@/control/controlMessages'
import type { Judgement } from '@/host/ui/stagePresentation'
import { playCue, unlockGameSounds } from '@/sounds/gameSounds'

const TICK_MS = 50
const CHANNEL_ERROR_MESSAGE = 'No hay conexión con Supabase. Revisa las variables de entorno.'
/** How long the room stays green or red before the game moves on. */
const JUDGEMENT_FLASH_MS = 900

/** Resolved once: the registry is a module constant, not something that varies. */
const PLAYLIST_NAMES = playlistNames()

export function useHostGame(songs: Song[]) {
  const [room, setRoom] = useState<string | null>(null)
  // The pairing secret for the host's own phone. Minted on the television and
  // never published on the public channel — see `src/host/pairing.ts`.
  const [controlToken, setControlToken] = useState<string | null>(null)
  const [session, setSession] = useState<HostSession>(() => initialSession(initialState()))
  const state = session.game
  const [judgement, setJudgement] = useState<Judgement | null>(null)
  // Starting before the iframes exist would play a silent round.
  const [audioReady, setAudioReady] = useState(false)
  const [channelError, setChannelError] = useState<string | null>(null)
  // Shuffled once the room is minted, not inside startGame: this gives the
  // preload effect below the whole lobby to buffer the first song instead of
  // racing a cold buffer the instant Start is pressed. The Start button stays
  // gated on audioReady, so there is time.
  const [pendingDeck, setPendingDeck] = useState<string[] | null>(null)
  // Recently-played song ids, oldest first — the room's memory across games.
  // Lives outside GameState on purpose (see src/game/config.ts's
  // HISTORY_LIMIT and src/host/persistence.ts's saveHistory): it is not part
  // of any one game, it survives a brand-new room code, and it must never
  // reach toPublicState or the control channel, unlike everything in `state`.
  const [history, setHistory] = useState<string[]>([])
  // What the host picked on their phone before the game started; null is the
  // whole deck. Kept raw here and validated into `deckSelection` below, so a
  // choice restored from a save — or one made against an older song list —
  // can never survive as a deck that no longer exists.
  const [chosenDeck, setChosenDeck] = useState<DeckSelection | null>(null)
  const audioRef = useRef<AudioPlayer | null>(null)
  const channelRef = useRef<Channel | null>(null)

  // Which themed decks this song list can actually fill a game from. Constant
  // for a given `songs`, and deliberately computed from the same pure function
  // the tests exercise: as the deck's years and artists get curated, more
  // options appear here with no change to this file.
  const deckAxes = useMemo(
    () => offerableDeckAxes(songs, MIN_DECK_OPTION_SONGS, PLAYLIST_NAMES),
    [songs],
  )
  const deckSelection = useMemo(
    () => (isOfferableSelection(deckAxes, chosenDeck) ? chosenDeck : null),
    [deckAxes, chosenDeck],
  )
  const deckSongs = useMemo(() => filterSongs(songs, deckSelection), [songs, deckSelection])

  // Restore after a reload, or mint a fresh room. localStorage and
  // Math.random are only meaningful client-side, so this has to run in an
  // effect (not a lazy useState initializer) to keep the server and first
  // client render identical and avoid a hydration mismatch.
  useEffect(() => {
    const saved = loadGame(window.localStorage)
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoom(saved.room)
      setSession(initialSession(saved.state))
      // A save written before pairing existed has no token; mint one rather
      // than leaving the host with no way to reach their own phone.
      setControlToken(saved.controlToken ?? createControlToken())
      // Restored so a reload mid-game keeps naming the deck the room is
      // playing, and a reload in the lobby keeps the host's choice.
      setChosenDeck(saved.deckSelection)
    } else {
      setRoom(createRoomCode(Math.random))
      setControlToken(createControlToken())
    }
    // The history key is independent of both branches above: it belongs to
    // this browser's ongoing evening, not to any one room or save.
    setHistory(loadHistory(window.localStorage))
  }, [])

  // Shuffle as soon as the lobby is entered (fresh room, or a reload that
  // landed before Start was pressed), so its first song can be preloaded
  // below well ahead of the Start click. Guarded on pendingDeck so this
  // does not reshuffle on every render. Songs the room heard recently (see
  // `history` above) sort to the back, so a second game the same evening
  // deals fresh songs first and only reaches into recent memory once those
  // run out.
  //
  // `deckSongs` — not `songs` — is what is shuffled: the host's deck choice
  // narrows the pool the game is dealt from. The room's memory is NOT narrowed
  // with it (it is the browser's memory of the evening, not of one deck), so a
  // filtered pool can find more of itself already remembered. `buildDeck`
  // handles that on its own: it always returns every id it was given, fresh
  // ones first, so even the narrowest offerable deck — exactly one game's
  // worth — still deals a full game. See `src/game/deck.test.ts`.
  useEffect(() => {
    if (!room || state.phase.kind !== 'lobby' || pendingDeck) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingDeck(buildDeck(deckSongs.map((s) => s.id), history, Math.random))
  }, [room, state.phase.kind, deckSongs, pendingDeck, history])

  // Every event goes through `step`, which is `reduce` plus the one thing the
  // reducer must not know about: whether the last judgement can still be taken
  // back. See `src/host/undo.ts`.
  const dispatch = useCallback((event: GameEvent) => {
    setSession((previous) => step(previous, event))
  }, [])

  const undo = useCallback(() => setSession(undoJudgement), [])
  const canUndo = session.undo !== null

  // The flash is a beat, not a state: a ❌ drops the game straight back into
  // `waiting`, so without this the room would never see the red. It lives
  // here, next to the dispatch, because the panel judges over the private
  // channel and its ✅ has to light the television exactly like the
  // television's own button does.
  useEffect(() => {
    if (!judgement) return
    const id = setTimeout(() => setJudgement(null), JUDGEMENT_FLASH_MS)
    return () => clearTimeout(id)
  }, [judgement])

  const judge = useCallback(
    (correct: boolean) => {
      unlockGameSounds()
      playCue(correct ? 'correct' : 'wrong')
      setJudgement(correct ? 'correct' : 'wrong')
      dispatch({ type: 'JUDGE', correct })
    },
    [dispatch],
  )

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
  //
  // The phones' countdown does not weaken this: `withCountdown` attaches the
  // remaining milliseconds AFTER the comparison, and the type of what
  // `toPublicState` returns has no room for it, so the countdown can never be
  // the reason a message goes out. One message per tier, and each phone
  // counts down locally from it.
  const lastPublishedRef = useRef<string | null>(null)
  // A JOIN is a request to be told the current state, not merely a state
  // change: for a player the host already knows, JOIN produces a
  // byte-identical projection (same players, same phase), so the equality
  // throttle below would otherwise swallow it and the phone would wait for
  // some unrelated future phase change to ever hear back — indefinitely, if
  // one lands mid-`waiting`. Set by the subscribe effect whenever a JOIN
  // arrives; consumed (and cleared) the next time this effect runs.
  //
  // This cannot become a publish storm: it only ever forces ONE publish per
  // JOIN actually received, and the phone that sends JOIN already throttles
  // its own re-announcements to one per REJOIN_INTERVAL_MS (2s, see
  // src/app/play/page.tsx). So even a room where every phone re-announces at
  // once is bounded at (phone count) publishes per 2s — no second throttle is
  // added here on purpose, per the same reasoning that keeps this file from
  // duplicating the phone's own retry logic.
  const forceNextPublishRef = useRef(false)
  useEffect(() => {
    if (!room) return
    saveGame(window.localStorage, { room, controlToken, state, deckSelection })

    // Effects run in declaration order, and the channel-creation effect below
    // is declared after this one. On the very first render where `room`
    // becomes non-null, both effects fire in the same flush, so the channel
    // does not exist yet here. Bail out WITHOUT touching lastPublishedRef (or
    // consuming forceNextPublishRef): if we recorded this state as
    // "published" while it never left the page, the throttle above would
    // then treat the next genuinely-sendable identical state as a duplicate
    // and swallow it too. The next state change (a tick, a JOIN) re-runs this
    // effect with the channel in place, so nothing is lost — only delayed.
    const channel = channelRef.current
    if (!channel) return

    const publicState = toPublicState(state)
    const serialized = JSON.stringify(publicState)
    const forced = forceNextPublishRef.current
    if (serialized === lastPublishedRef.current && !forced) return
    lastPublishedRef.current = serialized
    forceNextPublishRef.current = false
    void channel.publish({ type: 'STATE', state: withCountdown(publicState, state.phase) })
    // `deckSelection` is in the dependency list only so `saveGame` above keeps
    // up with it. It cannot weaken the throttle: `toPublicState` has no room
    // for it — nor may it ever gain one, see the anti-cheat note on
    // `ControlDeck` — so a deck change leaves the serialized projection
    // byte-identical and the equality check above still swallows the publish.
  }, [room, controlToken, state, deckSelection])

  // Grows the room's memory the moment a round is genuinely decided, so a
  // reload mid-game does not lose credit for songs already heard. The actual
  // decision — what counts as "decided", and staying idempotent across an
  // undo-then-rejudge that produces two distinct `revealed` phase objects
  // for the same round — lives in `recordRoundIfDecided` (`src/game/deck.ts`)
  // so it can be tested against the real reducer sequence rather than only
  // through this hook. `lastRecordedSongIdRef` is this call's memory of what
  // it last recorded, carried across renders and across React's dev-only
  // double-invoke of effects.
  const lastRecordedSongIdRef = useRef<string | null>(null)
  useEffect(() => {
    // `history` is deliberately left out of the dependency array: this effect
    // is keyed on `currentSongId` via `recordRoundIfDecided` (see above), and
    // including `history` here would re-run it every time `setHistory` below
    // fires — appending the very same song again, forever. The closure's
    // `history` is still the value from the render that scheduled this
    // effect, which is current precisely because nothing else changes it
    // between that render and this effect running.
    const result = recordRoundIfDecided(
      state.phase,
      state.currentSongId,
      lastRecordedSongIdRef.current,
      history,
      HISTORY_LIMIT,
    )
    if (!result.recorded) return
    lastRecordedSongIdRef.current = result.lastRecordedSongId
    saveHistory(window.localStorage, result.history)
    setHistory(result.history)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentSongId])

  // Listen to the phones. The host decides the winner by arrival order:
  // the reducer ignores every BUZZ after the first.
  useEffect(() => {
    if (!room) return
    let channel: Channel
    try {
      channel = createSupabaseChannel(room)
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChannelError(CHANNEL_ERROR_MESSAGE)
      return
    }
    channelRef.current = channel

    channel
      .subscribe((raw) => {
        const message = parsePlayerMessage(raw)
        if (!message) return
        if (message.type === 'JOIN') {
          // See forceNextPublishRef above: a JOIN always earns a reply, even
          // when it changes nothing the equality throttle would notice.
          forceNextPublishRef.current = true
          dispatch({ type: 'JOIN', playerId: message.playerId, name: message.name })
        } else {
          dispatch({ type: 'BUZZ', playerId: message.playerId })
        }
      })
      .catch(() => setChannelError(CHANNEL_ERROR_MESSAGE))

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

  // Keyed on currentSongId, not the whole `state`: state changes identity on
  // every 50ms tick, and re-deriving `song` that often is pure waste since
  // only a round change ever moves currentSongId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const song = useMemo(() => currentSong(state, songs), [state.currentSongId, songs])

  // Audio follows the TRANSITION, not the phase: only that tells "start tier 2"
  // apart from "come back to tier 2 after a wrong answer".
  const previousSnapshot = useRef<AudioSnapshot>({ kind: 'lobby', tier: null, resumes: false })
  // True once this page session has actually issued a `play`. A reload wipes
  // the double-buffered YouTube players (their videoId starts out null), so a
  // computed `resume` before any `play` happened in THIS session would try to
  // resume a player that never played anything — silence, not a recovery.
  // Treating that first `resume` as a `play` instead is what actually starts
  // the song after a reload that lands mid-buzz.
  const hasPlayedRef = useRef(false)
  useEffect(() => {
    const audio = audioRef.current
    // The player isn't attached yet (its iframes load asynchronously and are
    // almost always slower than this effect's first run after a reload).
    // Bail out WITHOUT advancing previousSnapshot: recording the transition
    // as handled here would mean it's never retried once the player attaches,
    // and this restored game would play silently until the next tier
    // boundary. Leaving the snapshot stale keeps the transition pending, and
    // `audioReady` in the dependency array below guarantees a retry.
    if (!audio) return

    const next = snapshot(state.phase)
    let action = audioActionFor(previousSnapshot.current, next)
    previousSnapshot.current = next

    if (action === 'resume' && !hasPlayedRef.current) action = 'play'

    if (action === 'play' && song) {
      void audio.play(song.videoId, song.startSeconds)
      hasPlayedRef.current = true
    }
    if (action === 'resume') audio.resume()
    if (action === 'pause') audio.pause()
    if (action === 'stop') audio.stop()
  }, [state.phase, song, audioReady])

  // Buffer the next song while this one plays, so there is no dead air. In
  // the lobby the deck is still empty (it is only dealt into on START_GAME),
  // so the song to preload there comes from pendingDeck instead — without
  // this branch the very first song of the game would hit a cold buffer.
  // `audioReady` is in the dependency array so this retries once the player
  // attaches, matching the audio-transition effect above.
  useEffect(() => {
    const upcomingId = state.phase.kind === 'lobby' ? pendingDeck?.[0] : state.deck[0]
    const next = songs.find((s) => s.id === upcomingId)
    if (next) void audioRef.current?.preload(next.videoId, next.startSeconds)
  }, [state.phase.kind, state.deck, pendingDeck, songs, audioReady])

  const startGame = useCallback(() => {
    // pendingDeck is the exact deck whose first song was just preloaded
    // above; dealing a different, freshly-shuffled deck here would preload
    // one song and play another.
    if (!pendingDeck) return
    dispatch({
      type: 'START_GAME',
      deck: pendingDeck,
      roundsTotal: Math.min(DEFAULT_ROUNDS, pendingDeck.length),
    })
  }, [pendingDeck, dispatch])

  const attachAudio = useCallback((player: AudioPlayer) => {
    audioRef.current = player
    setAudioReady(true)
  }, [])

  const newGame = useCallback(() => {
    clearGame(window.localStorage)
    window.location.reload()
  }, [])

  // The panel-only "abandon and restart" control. Unlike `newGame` above,
  // this never touches localStorage, the room code or the pairing token —
  // the room the players and the panel are already connected to simply
  // plays again. `NEW_SESSION` clears `state.deck` back to its pre-start
  // empty value (see the reducer), so `pendingDeck` is cleared here too:
  // without it the reshuffle effect below would find a deck already sitting
  // there — the one the game just finished with, in the same order — and
  // never reshuffle at all.
  const newSession = useCallback(() => {
    dispatch({ type: 'NEW_SESSION' })
    setPendingDeck(null)
  }, [dispatch])

  // The host's deck choice, arriving from their phone.
  //
  // Two guards, both of which have to be here rather than on the panel. Only
  // the lobby may change it: mid-game the deck has already been dealt and
  // swapping the pool underneath it would leave the preloaded song and the
  // played song from different decks. And only an option the television
  // itself offers is honoured — a panel on an older build could name one that
  // no longer holds a full game, and a message does not get to shorten a game.
  //
  // `pendingDeck` is cleared so the shuffle effect above reshuffles from the
  // new pool; without that it would find the previous deck already sitting
  // there and keep it, exactly as `newSession` has to.
  const selectDeck = useCallback(
    (selection: DeckSelection | null) => {
      if (state.phase.kind !== 'lobby') return
      if (!isOfferableSelection(deckAxes, selection)) return
      setChosenDeck(selection)
      setPendingDeck(null)
    },
    [state.phase.kind, deckAxes],
  )

  const startGameWithSound = useCallback(() => {
    // The one guaranteed user gesture on this page. Web Audio refuses to make
    // a sound before one, so the context is created here rather than on load.
    unlockGameSounds()
    startGame()
  }, [startGame])

  // What the host's phone is told. Recomputed on every tick like the public
  // projection, and like it, holding nothing that changes on a tick — so the
  // equality throttle inside `useControlChannel` sends one message per real
  // change, not twenty a second.
  const chosenDeckLabel = useMemo(() => deckLabel(deckSelection, PLAYLIST_NAMES), [deckSelection])
  const controlDeck = useMemo(
    () => ({
      axes: deckAxes,
      selection: deckSelection,
      label: chosenDeckLabel,
      size: deckSongs.length,
      total: songs.length,
    }),
    [deckAxes, deckSelection, chosenDeckLabel, deckSongs, songs],
  )

  const controlState = useMemo(
    () => (room ? toControlState(state, song, room, canUndo, controlDeck) : null),
    [room, state, song, canUndo, controlDeck],
  )

  const onControlAction = useCallback(
    (action: ControlAction) => {
      switch (action.type) {
        case 'JUDGE':
          // Straight through the television's own judge path, so a ✅ from the
          // phone flashes the room and plays the cue exactly as the button
          // beside the laptop does.
          judge(action.correct)
          return
        case 'UNDO':
          undo()
          return
        case 'NEW_SESSION':
          newSession()
          return
        case 'SELECT_DECK':
          selectDeck(action.selection)
          return
        case 'LAUNCH_TIER':
        case 'SKIP_SONG':
        case 'NEXT_ROUND':
          dispatch({ type: action.type })
      }
    },
    [judge, undo, newSession, selectDeck, dispatch],
  )

  const { paired } = useControlChannel(controlToken, controlState, onControlAction)

  return {
    room,
    controlToken,
    panelPaired: paired,
    state,
    song,
    audioReady,
    channelError,
    judgement,
    canUndo,
    // What the television tells the room it is playing. `label` is always a
    // real name — "Todo el mazo" included — so the lobby can state the deck
    // unconditionally and a choice dropped by "Nueva partida" shows up as
    // changed words rather than as a line that quietly disappeared.
    // `chosen` is what the header chip keys off instead, because a chip that
    // is always there stops being read.
    deck: { label: chosenDeckLabel, chosen: deckSelection !== null },
    dispatch,
    judge,
    undo,
    startGame: startGameWithSound,
    attachAudio,
    newGame,
  }
}
