import { DEFAULT_ROUNDS, WRONG_ANSWER_PENALTY } from '@/game/config'
import { nextTier, pointsForTier, tierDurationMs } from '@/game/tiers'
import type { GameEvent, GameState, Player, PlayerId, Song } from '@/game/types'

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

/** Deals the next song. Assumes the deck is non-empty. */
function dealRound(state: GameState): GameState {
  const [songId, ...rest] = state.deck
  return {
    ...state,
    deck: rest,
    currentSongId: songId,
    roundsPlayed: state.roundsPlayed + 1,
    lockedOut: [],
    phase: { kind: 'playing', tier: 1, elapsedMs: 0 },
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
      return { ...state, phase: { kind: 'playing', tier: upcoming, elapsedMs: 0 } }
    }

    case 'BUZZ': {
      if (state.phase.kind !== 'playing') return state
      if (state.lockedOut.includes(event.playerId)) return state
      if (!state.players.some((p) => p.id === event.playerId)) return state
      return {
        ...state,
        phase: {
          kind: 'buzzed',
          tier: state.phase.tier,
          elapsedMs: state.phase.elapsedMs,
          playerId: event.playerId,
        },
      }
    }

    case 'JUDGE': {
      if (state.phase.kind !== 'buzzed') return state
      const { playerId, tier, elapsedMs } = state.phase

      if (event.correct) {
        return {
          ...state,
          players: addScore(state.players, playerId, pointsForTier(tier)),
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
      return { ...state, players, lockedOut, phase: { kind: 'playing', tier, elapsedMs } }
    }

    case 'NEXT_ROUND': {
      // Allowed once the round is fully revealed, or once at least one
      // player has been judged out mid-round (lockedOut is non-empty) even
      // if other players never got a turn. Blocked while a judgement is
      // pending, or while the round is still playing and nobody has been
      // judged yet.
      const canAdvance =
        state.phase.kind === 'revealed' ||
        (state.phase.kind === 'playing' && state.lockedOut.length > 0)
      if (!canAdvance) return state
      const gameOver = state.roundsPlayed >= state.roundsTotal || state.deck.length === 0
      if (gameOver) return { ...state, phase: { kind: 'finished' }, currentSongId: null }
      return dealRound(state)
    }

    case 'SKIP_SONG': {
      if (state.phase.kind !== 'playing' && state.phase.kind !== 'buzzed') return state
      return { ...state, phase: { kind: 'revealed', outcome: 'skipped', winnerId: null } }
    }

    default:
      return state
  }
}

export function currentSong(state: GameState, songs: Song[]): Song | null {
  if (!state.currentSongId) return null
  return songs.find((s) => s.id === state.currentSongId) ?? null
}
