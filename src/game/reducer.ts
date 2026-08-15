import { DEFAULT_ROUNDS } from '@/game/config'
import { nextTier, tierDurationMs } from '@/game/tiers'
import type { GameEvent, GameState, Song } from '@/game/types'

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

    default:
      return state
  }
}

export function currentSong(state: GameState, songs: Song[]): Song | null {
  if (!state.currentSongId) return null
  return songs.find((s) => s.id === state.currentSongId) ?? null
}
