import { DEFAULT_ROUNDS, WRONG_ANSWER_PENALTY } from '@/game/config'
import { nextTier, pointsForTier, tierDurationMs } from '@/game/tiers'
import type { GameEvent, GameState, Player, PlayerId, Song, Stakes } from '@/game/types'

export function initialState(): GameState {
  return {
    players: [],
    deck: [],
    currentSongId: null,
    roundsPlayed: 0,
    roundsTotal: DEFAULT_ROUNDS,
    lockedOut: [],
    phase: { kind: 'lobby' },
  }
}

/**
 * Deals the next song and hands the room back to the host.
 *
 * A round no longer starts sounding on its own: between tiers the room is
 * arguing about what the song is, and music restarting by itself is
 * indistinguishable from the music that was already there. The host holds the
 * room and presses to start each tier.
 *
 * `heardThisRound: false` is the one thing that makes this wait different
 * from every other `waiting` phase in the round: nothing has sounded yet, so
 * a press here must not be allowed to score. See the note on `Phase` in
 * `types.ts` and the guard in `BUZZ` below.
 */
function dealRound(state: GameState): GameState {
  const [songId, ...rest] = state.deck
  return {
    ...state,
    deck: rest,
    currentSongId: songId,
    roundsPlayed: state.roundsPlayed + 1,
    lockedOut: [],
    phase: { kind: 'waiting', worthTier: 1, launchTier: 1, resumeAtMs: 0, heardThisRound: false },
  }
}

function addScore(players: Player[], playerId: PlayerId, delta: number): Player[] {
  return players.map((p) => (p.id === playerId ? { ...p, score: p.score + delta } : p))
}

export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'JOIN': {
      const existing = state.players.find((p) => p.id === event.playerId)
      if (existing) {
        return {
          ...state,
          players: state.players.map((p) =>
            p.id === event.playerId ? { ...p, name: event.name } : p,
          ),
        }
      }
      return {
        ...state,
        players: [...state.players, { id: event.playerId, name: event.name, score: 0 }],
      }
    }

    case 'START_GAME': {
      return dealRound({
        ...state,
        deck: event.deck,
        roundsTotal: event.roundsTotal,
        roundsPlayed: 0,
      })
    }

    case 'LAUNCH_TIER': {
      if (state.phase.kind !== 'waiting') return state
      const { launchTier, resumeAtMs } = state.phase
      // `resumeAtMs` is 0 for a fresh tier and the exact cut point after a
      // wrong answer, so one line covers both "sound tier 2" and "carry on
      // from 3.4 s into tier 2".
      return { ...state, phase: { kind: 'playing', tier: launchTier, elapsedMs: resumeAtMs } }
    }

    // TICK deltas must stay small relative to a tier's duration: a delta that
    // overshoots a boundary loses the excess. The host guarantees this by
    // dispatching a constant 50 ms.
    case 'TICK': {
      if (state.phase.kind !== 'playing') return state
      const elapsedMs = state.phase.elapsedMs + event.deltaMs
      if (elapsedMs < tierDurationMs(state.phase.tier)) {
        return { ...state, phase: { ...state.phase, elapsedMs } }
      }
      const upcoming = nextTier(state.phase.tier)
      if (upcoming === null) {
        return { ...state, phase: { kind: 'revealed', outcome: 'timeout', winnerId: null } }
      }
      // The tier that just ran out is STILL what a press is worth. Somebody
      // who names the song half a second after the music stops has earned it;
      // that is what makes the pause tense rather than dead. A whole tier
      // just played, so this wait is pressable no matter what the round's
      // opening wait was.
      return {
        ...state,
        phase: {
          kind: 'waiting',
          worthTier: state.phase.tier,
          launchTier: upcoming,
          resumeAtMs: 0,
          heardThisRound: true,
        },
      }
    }

    case 'BUZZ': {
      const { phase } = state
      // Pressing during the pause is deliberate, not a leak: the wait is part
      // of the round, and it pays whatever the last tier heard was worth —
      // PROVIDED there was a last tier heard. The round's very first wait
      // (before the host has launched tier 1 even once) has nothing to pay
      // out yet, so it is the one `waiting` phase a press cannot act on.
      if (phase.kind !== 'playing' && phase.kind !== 'waiting') return state
      if (phase.kind === 'waiting' && !phase.heardThisRound) return state
      if (state.lockedOut.includes(event.playerId)) return state
      if (!state.players.some((p) => p.id === event.playerId)) return state

      const stakes: Stakes =
        phase.kind === 'playing'
          ? { worthTier: phase.tier, launchTier: phase.tier, resumeAtMs: phase.elapsedMs }
          : { worthTier: phase.worthTier, launchTier: phase.launchTier, resumeAtMs: phase.resumeAtMs }

      return { ...state, phase: { kind: 'buzzed', playerId: event.playerId, ...stakes } }
    }

    case 'JUDGE': {
      if (state.phase.kind !== 'buzzed') return state
      const { playerId, worthTier, launchTier, resumeAtMs } = state.phase

      if (event.correct) {
        return {
          ...state,
          players: addScore(state.players, playerId, pointsForTier(worthTier)),
          phase: { kind: 'revealed', outcome: 'correct', winnerId: playerId },
        }
      }

      const players = addScore(state.players, playerId, -WRONG_ANSWER_PENALTY)
      const lockedOut = [...state.lockedOut, playerId]
      if (lockedOut.length >= players.length) {
        return {
          ...state,
          players,
          lockedOut,
          phase: { kind: 'revealed', outcome: 'allWrong', winnerId: null },
        }
      }
      // The three facts come back untouched: same worth, same tier, same
      // millisecond. The audio resumes rather than restarting, so the hook is
      // never handed out twice.
      //
      // `heardThisRound: true`, always — not carried, hardcoded. `buzzed` is
      // only ever reached via `BUZZ`, and by the time that event is accepted
      // either the phase was `playing` (a tier is actively launched, which
      // counts as heard the instant it starts — see `Phase` in types.ts) or
      // it was a `waiting` phase that had already passed the `heardThisRound`
      // guard above. Either way, something has necessarily sounded this round
      // by the time a `buzzed` phase exists, so the wait a wrong answer
      // returns to is never the round's un-pressable opening wait.
      return {
        ...state,
        players,
        lockedOut,
        phase: { kind: 'waiting', worthTier, launchTier, resumeAtMs, heardThisRound: true },
      }
    }

    case 'NEXT_ROUND': {
      // A round is only ever left through the reveal screen: correct,
      // allWrong, timeout, or skipped. The host's "next song" control only
      // renders once the phase is 'revealed', so a NEXT_ROUND arriving while
      // still 'waiting', 'playing' or 'buzzed' means it was dispatched out of
      // order upstream; ignore it rather than cutting a round short.
      if (state.phase.kind !== 'revealed') return state
      const gameOver = state.roundsPlayed >= state.roundsTotal || state.deck.length === 0
      if (gameOver) return { ...state, phase: { kind: 'finished' }, currentSongId: null }
      return dealRound(state)
    }

    case 'SKIP_SONG': {
      const { kind } = state.phase
      if (kind !== 'waiting' && kind !== 'playing' && kind !== 'buzzed') return state
      return { ...state, phase: { kind: 'revealed', outcome: 'skipped', winnerId: null } }
    }

    // Abandon-and-restart, in one step rather than four. Scores, the current
    // song, the per-song elimination list and the phase all describe "where
    // the room is right now"; resetting three of them and forgetting the
    // fourth is exactly the kind of bug that only shows up mid-party, so they
    // are set together here instead of being assembled by a caller. The deck
    // goes with them — empty is the deck's own pre-start value, see
    // `initialState` — and the host deals a freshly shuffled one back in via
    // `START_GAME`, exactly like the first game. Reshuffling itself does not
    // belong here: it needs `Math.random`, and this file stays pure.
    case 'NEW_SESSION': {
      return {
        ...state,
        players: state.players.map((p) => ({ ...p, score: 0 })),
        deck: [],
        currentSongId: null,
        roundsPlayed: 0,
        roundsTotal: DEFAULT_ROUNDS,
        lockedOut: [],
        phase: { kind: 'lobby' },
      }
    }

    default:
      return state
  }
}

export function currentSong(state: GameState, songs: Song[]): Song | null {
  if (!state.currentSongId) return null
  return songs.find((s) => s.id === state.currentSongId) ?? null
}
