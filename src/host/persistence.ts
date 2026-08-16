import type { Tier } from '@/game/tiers'
import type { GameState, Phase, Player, RevealOutcome, Stakes } from '@/game/types'
import { isControlToken } from '@/host/pairing'

const KEY = 'hitster:host'

export interface SavedGame {
  room: string
  /**
   * The secret naming the channel the host's phone is paired on. Persisted so
   * a reload of the television does not silently orphan a paired panel — the
   * phone would keep listening on a channel nothing published to any more.
   */
  controlToken: string | null
  state: GameState
}

/**
 * Bump this whenever `GameState`'s persisted shape changes (a phase gains or
 * loses a field, a new phase kind is added, etc). A mismatched — or missing —
 * version makes `loadGame` discard the save rather than hand a stale shape to
 * the reducer. This is what happened in production: an older build wrote a
 * `buzzed` phase as `{ kind, tier, elapsedMs, playerId }`, the current build
 * reads `buzzed` as `{ kind, playerId, worthTier, launchTier, resumeAtMs }`,
 * and `tierConfig(undefined)` threw before the tree could render.
 */
export const SAVE_VERSION = 1

export function saveGame(storage: Storage, save: SavedGame): void {
  storage.setItem(KEY, JSON.stringify({ version: SAVE_VERSION, ...save }))
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isTier(value: unknown): value is Tier {
  return value === 1 || value === 2 || value === 3
}

const OUTCOMES = new Set<RevealOutcome>(['correct', 'allWrong', 'timeout', 'skipped'])

function isOutcome(value: unknown): value is RevealOutcome {
  return typeof value === 'string' && OUTCOMES.has(value as RevealOutcome)
}

/** The three frozen facts every `waiting` and `buzzed` phase carries. */
function parseStakes(phase: Record<string, unknown>): Stakes | null {
  if (!isTier(phase.worthTier) || !isTier(phase.launchTier) || !isFiniteNumber(phase.resumeAtMs)) {
    return null
  }
  return { worthTier: phase.worthTier, launchTier: phase.launchTier, resumeAtMs: phase.resumeAtMs }
}

/**
 * Validates the phase discriminant AND the fields each kind carries — this is
 * exactly the shape that crashed production (a `buzzed` phase from a build
 * whose `Stakes` fields did not exist yet), so it gets the same scrutiny
 * `parsePublicState` in `src/realtime/messages.ts` gives network messages.
 */
function parsePhase(raw: unknown): Phase | null {
  const phase = asRecord(raw)
  if (!phase) return null

  switch (phase.kind) {
    case 'lobby':
      return { kind: 'lobby' }
    case 'finished':
      return { kind: 'finished' }
    case 'waiting': {
      const stakes = parseStakes(phase)
      return stakes ? { kind: 'waiting', ...stakes } : null
    }
    case 'playing': {
      if (!isTier(phase.tier) || !isFiniteNumber(phase.elapsedMs)) return null
      return { kind: 'playing', tier: phase.tier, elapsedMs: phase.elapsedMs }
    }
    case 'buzzed': {
      if (!nonEmptyString(phase.playerId)) return null
      const stakes = parseStakes(phase)
      return stakes ? { kind: 'buzzed', playerId: phase.playerId, ...stakes } : null
    }
    case 'revealed': {
      if (!isOutcome(phase.outcome)) return null
      if (phase.winnerId !== null && !nonEmptyString(phase.winnerId)) return null
      return { kind: 'revealed', outcome: phase.outcome, winnerId: phase.winnerId as string | null }
    }
    default:
      return null
  }
}

function parsePlayer(raw: unknown): Player | null {
  const player = asRecord(raw)
  if (!player) return null
  if (!nonEmptyString(player.id)) return null
  if (typeof player.name !== 'string') return null
  if (!isFiniteNumber(player.score)) return null
  return { id: player.id, name: player.name, score: player.score }
}

/** Enough of `GameState`'s shape checked that a wrong value can never reach the reducer or the renderer. */
function parseGameState(raw: unknown): GameState | null {
  const state = asRecord(raw)
  if (!state) return null

  if (!Array.isArray(state.players)) return null
  const players: Player[] = []
  for (const rawPlayer of state.players) {
    const player = parsePlayer(rawPlayer)
    if (!player) return null
    players.push(player)
  }

  if (!Array.isArray(state.deck) || !state.deck.every((id) => typeof id === 'string')) return null
  const deck = state.deck as string[]

  if (state.currentSongId !== null && typeof state.currentSongId !== 'string') return null
  const currentSongId = state.currentSongId as string | null

  if (!isFiniteNumber(state.roundsPlayed) || !isFiniteNumber(state.roundsTotal)) return null

  if (!Array.isArray(state.lockedOut) || !state.lockedOut.every(nonEmptyString)) return null
  const lockedOut = state.lockedOut as string[]

  const phase = parsePhase(state.phase)
  if (!phase) return null

  return { players, deck, currentSongId, roundsPlayed: state.roundsPlayed, roundsTotal: state.roundsTotal, lockedOut, phase }
}

/**
 * Corrupted, obsolete, or structurally wrong data all mean "no game": never
 * let this crash the host. A version mismatch (including no version at all —
 * every save written before this check existed) discards the whole payload
 * without even looking at its shape. What survives that still gets its shape
 * validated field by field, because a version bump is easy to forget on a
 * change that doesn't touch the version constant's neighborhood, and because
 * `localStorage` deserves the same suspicion as the network: it holds data
 * written by a different version of this program.
 */
export function loadGame(storage: Storage): SavedGame | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version !== SAVE_VERSION) return null
    if (typeof parsed.room !== 'string') return null
    const state = parseGameState(parsed.state)
    if (!state) return null
    // The pairing token is the one field that may legitimately be absent: it
    // was added after this format shipped, and a save without it is a game
    // that never had a panel. Missing or malformed simply means "unpaired",
    // which the host answers by minting a fresh token — so an additive field
    // costs nobody their game, and no version bump is needed to discard a save
    // that is otherwise perfectly readable.
    const controlToken = isControlToken(parsed.controlToken) ? parsed.controlToken : null
    return { room: parsed.room, controlToken, state }
  } catch {
    return null
  }
}

export function clearGame(storage: Storage): void {
  storage.removeItem(KEY)
}

const HISTORY_KEY = 'hitster:history'

/**
 * Bump this whenever the persisted history shape changes. Independent from
 * `SAVE_VERSION`: the history is the room's memory across games, not part of
 * any single game's save, and there is no reason a change to one shape
 * should force the other's version forward.
 */
export const HISTORY_VERSION = 1

/**
 * Recently-played song ids, oldest first. Deliberately its own key rather
 * than a field inside `SavedGame`: `clearGame` (a fresh room's "new game"
 * button) removes the save but must not erase what the room has heard —
 * that is the entire point of this feature. It survives everything a save
 * does not: a new room code, `NEW_SESSION`, a reload.
 */
export function saveHistory(storage: Storage, history: string[]): void {
  storage.setItem(HISTORY_KEY, JSON.stringify({ version: HISTORY_VERSION, songIds: history }))
}

/**
 * Corrupted, obsolete, or structurally wrong data all mean "no memory yet",
 * never a crash: exactly the same posture `loadGame` takes, because this is
 * still `localStorage` data written by a possibly-older build. Falling back
 * to an empty history is also the correct degrade-gracefully behaviour, not
 * just a safe one — an unreadable history is no worse than a room's first
 * game ever.
 */
export function loadHistory(storage: Storage): string[] {
  const raw = storage.getItem(HISTORY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version !== HISTORY_VERSION) return []
    if (!Array.isArray(parsed.songIds) || !parsed.songIds.every(nonEmptyString)) return []
    return parsed.songIds
  } catch {
    return []
  }
}

export function clearHistory(storage: Storage): void {
  storage.removeItem(HISTORY_KEY)
}
