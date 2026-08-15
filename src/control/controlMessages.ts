import type { ControlPlayer, ControlSong, ControlState } from '@/control/controlState'

/**
 * The two directions of the private channel.
 *
 * Both sides validate, for the same reason `src/realtime/messages.ts` does:
 * anything that arrives is data written by another program, and the host in
 * particular must never let a malformed payload dispatch a game event. The
 * token in the channel name is what keeps strangers out; this is what keeps a
 * stale or broken build from moving the scoreboard.
 */
export type ControlCommand =
  /** The panel announcing itself, so the television answers with a full state. */
  | { type: 'HELLO' }
  | { type: 'JUDGE'; correct: boolean }
  | { type: 'LAUNCH_TIER' }
  | { type: 'SKIP_SONG' }
  | { type: 'NEXT_ROUND' }
  | { type: 'UNDO' }

/**
 * A command that actually moves the game. `HELLO` is not one of them — it is
 * answered by the channel itself with a fresh state — and the type says so, so
 * the television's handler cannot be written as if a greeting were an act.
 */
export type ControlAction = Exclude<ControlCommand, { type: 'HELLO' }>

export type ControlMessage = { type: 'CONTROL_STATE'; state: ControlState }

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

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

const PHASES = new Set(['lobby', 'waiting', 'playing', 'buzzed', 'revealed', 'finished'])
const OUTCOMES = new Set(['correct', 'allWrong', 'timeout', 'skipped'])

function parseSong(raw: unknown): ControlSong | null | 'invalid' {
  if (raw === null) return null
  const song = asRecord(raw)
  if (!song) return 'invalid'
  if (typeof song.title !== 'string' || typeof song.artist !== 'string') return 'invalid'
  if (!isFiniteNumber(song.year)) return 'invalid'
  return { title: song.title, artist: song.artist, year: song.year }
}

function parsePlayer(raw: unknown): ControlPlayer | null {
  const player = asRecord(raw)
  if (!player) return null
  if (!nonEmptyString(player.id)) return null
  if (typeof player.name !== 'string') return null
  if (!isFiniteNumber(player.score)) return null
  if (typeof player.out !== 'boolean') return null
  return { id: player.id, name: player.name, score: player.score, out: player.out }
}

function isTierOrNull(value: unknown): value is 1 | 2 | 3 | null {
  return value === null || value === 1 || value === 2 || value === 3
}

/** Validates the whole shape, so the panel can render it without defending itself. */
export function parseControlMessage(raw: unknown): ControlMessage | null {
  const message = asRecord(raw)
  if (!message || message.type !== 'CONTROL_STATE') return null

  const state = asRecord(message.state)
  if (!state) return null
  if (typeof state.room !== 'string') return null
  if (typeof state.phase !== 'string' || !PHASES.has(state.phase)) return null
  if (!isFiniteNumber(state.roundsPlayed) || !isFiniteNumber(state.roundsTotal)) return null

  const song = parseSong(state.song)
  if (song === 'invalid') return null

  if (!isNullableString(state.buzzedName) || !isNullableString(state.winnerName)) return null
  if (!isNullableNumber(state.buzzedPoints) || !isNullableNumber(state.pointsAtStake)) return null
  if (!isTierOrNull(state.launchTier) || !isNullableNumber(state.launchResumesAtMs)) return null
  if (state.outcome !== null && (typeof state.outcome !== 'string' || !OUTCOMES.has(state.outcome))) {
    return null
  }
  if (typeof state.canUndo !== 'boolean') return null
  if (!Array.isArray(state.players)) return null

  const players: ControlPlayer[] = []
  for (const rawPlayer of state.players) {
    const player = parsePlayer(rawPlayer)
    if (!player) return null
    players.push(player)
  }

  return {
    type: 'CONTROL_STATE',
    state: {
      room: state.room,
      phase: state.phase as ControlState['phase'],
      roundsPlayed: state.roundsPlayed,
      roundsTotal: state.roundsTotal,
      song,
      buzzedName: state.buzzedName,
      buzzedPoints: state.buzzedPoints,
      launchTier: state.launchTier,
      launchResumesAtMs: state.launchResumesAtMs,
      pointsAtStake: state.pointsAtStake,
      outcome: state.outcome as ControlState['outcome'],
      winnerName: state.winnerName,
      canUndo: state.canUndo,
      players,
    },
  }
}

/**
 * Validates a command before the television acts on it.
 *
 * `JUDGE` demands a real boolean rather than anything truthy: a payload whose
 * `correct` field went missing must be dropped, not silently read as a ❌ that
 * costs somebody a point.
 */
export function parseControlCommand(raw: unknown): ControlCommand | null {
  const message = asRecord(raw)
  if (!message) return null
  switch (message.type) {
    case 'HELLO':
      return { type: 'HELLO' }
    case 'JUDGE':
      return typeof message.correct === 'boolean' ? { type: 'JUDGE', correct: message.correct } : null
    case 'LAUNCH_TIER':
      return { type: 'LAUNCH_TIER' }
    case 'SKIP_SONG':
      return { type: 'SKIP_SONG' }
    case 'NEXT_ROUND':
      return { type: 'NEXT_ROUND' }
    case 'UNDO':
      return { type: 'UNDO' }
    default:
      return null
  }
}
