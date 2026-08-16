import type { ControlDeck, ControlPlayer, ControlSong, ControlState } from '@/control/controlState'
import type { DeckAxis, DeckAxisId, DeckOption, DeckSelection } from '@/game/deckFilters'

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
   * Picks which songs the next game is dealt from. `null` is the whole deck.
   *
   * The television checks the selection against its own offer before honouring
   * it (see `isOfferableSelection`): a panel on an older build could name an
   * option that no longer holds a full game, and a deck too small to play is
   * not something a message gets to impose.
   */
  | { type: 'SELECT_DECK'; selection: DeckSelection | null }
  /**
   * Abandons the game in progress and starts a fresh one in the same room.
   * The panel only ever sends this after its own confirmation step — see
   * `ControlPanel` — so arrival here is already the deliberate act, not the
   * first tap.
   */
  | { type: 'NEW_SESSION' }

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

const DECK_AXES = new Set<DeckAxisId>(['playlist', 'decade', 'genre', 'artist'])

function isDeckAxisId(value: unknown): value is DeckAxisId {
  return typeof value === 'string' && DECK_AXES.has(value as DeckAxisId)
}

/**
 * `null` is a valid selection — the whole deck — so "absent" and "invalid"
 * cannot both be reported as null. `'invalid'` is the third answer, exactly as
 * `parseSong` above does it.
 */
function parseDeckSelection(raw: unknown): DeckSelection | null | 'invalid' {
  if (raw === null) return null
  const selection = asRecord(raw)
  if (!selection) return 'invalid'
  if (!isDeckAxisId(selection.axis) || !nonEmptyString(selection.value)) return 'invalid'
  return { axis: selection.axis, value: selection.value }
}

function parseDeckOption(raw: unknown, axis: DeckAxisId): DeckOption | null {
  const option = asRecord(raw)
  if (!option) return null
  // An option claiming to belong to another axis than the one holding it is a
  // broken payload, not a quirk: the panel sends back `{axis, value}` straight
  // from here, and a mismatched pair would ask for a deck nobody offered.
  if (option.axis !== axis || !nonEmptyString(option.value)) return null
  if (typeof option.label !== 'string' || !isFiniteNumber(option.count)) return null
  return { axis, value: option.value, label: option.label, count: option.count }
}

function parseDeckAxis(raw: unknown): DeckAxis | null {
  const axis = asRecord(raw)
  if (!axis) return null
  if (!isDeckAxisId(axis.id) || typeof axis.label !== 'string') return null
  if (!Array.isArray(axis.options) || axis.options.length === 0) return null

  const options: DeckOption[] = []
  for (const rawOption of axis.options) {
    const option = parseDeckOption(rawOption, axis.id)
    if (!option) return null
    options.push(option)
  }
  return { id: axis.id, label: axis.label, options }
}

function parseDeck(raw: unknown): ControlDeck | null {
  const deck = asRecord(raw)
  if (!deck) return null
  if (typeof deck.label !== 'string') return null
  if (!isFiniteNumber(deck.size) || !isFiniteNumber(deck.total)) return null

  const selection = parseDeckSelection(deck.selection)
  if (selection === 'invalid') return null

  if (!Array.isArray(deck.axes)) return null
  const axes: DeckAxis[] = []
  for (const rawAxis of deck.axes) {
    const axis = parseDeckAxis(rawAxis)
    if (!axis) return null
    axes.push(axis)
  }
  return { axes, selection, label: deck.label, size: deck.size, total: deck.total }
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

  const deck = parseDeck(state.deck)
  if (!deck) return null

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
      deck,
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
    case 'SELECT_DECK': {
      // `null` and "the field never arrived" are different things, and only
      // the first means "the whole deck": a payload that lost its `selection`
      // must be dropped, not read as a silent reset to the full deck.
      if (!('selection' in message)) return null
      const selection = parseDeckSelection(message.selection)
      return selection === 'invalid' ? null : { type: 'SELECT_DECK', selection }
    }
    case 'NEW_SESSION':
      return { type: 'NEW_SESSION' }
    default:
      return null
  }
}
