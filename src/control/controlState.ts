import { pointsForTier } from '@/game/tiers'
import { pointsAtStake } from '@/game/publicState'
import type { DeckAxis, DeckSelection } from '@/game/deckFilters'
import type { GameState, Phase, PlayerId, RevealOutcome, Song } from '@/game/types'

/**
 * Everything the host's own phone is told.
 *
 * This is the mirror image of `PublicState`: that projection exists to keep
 * the song out of the players' browsers, and this one exists to put it in
 * front of the one person who has to judge it. The two never share a channel —
 * see `src/host/pairing.ts` for why the panel gets a channel named after a
 * secret rather than after the room.
 *
 * Nothing in here changes on a tick. The host compares consecutive projections
 * and only publishes when one differs, exactly as it does for the phones, so a
 * ticking field would turn the private channel into 20 messages a second for
 * no gain.
 */
export interface ControlPlayer {
  id: PlayerId
  name: string
  score: number
  /** Eliminated from the current song only. */
  out: boolean
}

export interface ControlSong {
  title: string
  artist: string
  /** 0 when the year is unknown; the panel then shows nothing rather than a lie. */
  year: number
}

/**
 * The deck the room is about to play, and everything the host needs to change
 * it.
 *
 * It lives on the private channel and nowhere else. A chosen deck is a real
 * hint about what is playing — "todo esto es de los 2020" narrows twenty
 * guesses at once — so the players' phones are never told, exactly as they are
 * never told the song. See `toPublicState`, which has no room for this and
 * must not gain one.
 *
 * `axes` is constant for a given song list, which is what lets it ride along
 * in every message for free: the host only publishes when the projection
 * actually changes, and a field that never changes can never be the reason it
 * does.
 */
export interface ControlDeck {
  /** The axes and options this deck can fill a whole game from. Possibly empty. */
  axes: DeckAxis[]
  /** What the host picked. Null is the whole deck — the default, always available. */
  selection: DeckSelection | null
  /** Resolved name of that choice, so the panel never has to look one up. */
  label: string
  /** How many songs the choice holds. */
  size: number
  /** How many songs the whole deck holds, so "Todo el mazo" can say so too. */
  total: number
}

export interface ControlState {
  /** So the panel can offer the join link without it being in its own URL. */
  room: string
  phase: Phase['kind']
  roundsPlayed: number
  roundsTotal: number
  /** The answer. Null in the lobby, between games, and while no song is dealt. */
  song: ControlSong | null
  /** Who is being judged right now, and what their answer is worth. */
  buzzedName: string | null
  buzzedPoints: number | null
  /** The tier the launch button will sound, and whether it resumes a cut one. */
  launchTier: 1 | 2 | 3 | null
  launchResumesAtMs: number | null
  /**
   * What a press is worth right now, or null where a press cannot score.
   *
   * Computed by the engine's own `pointsAtStake` (`src/game/publicState.ts`)
   * rather than a second implementation here — that function already knows
   * the round's opening wait (before the host has launched tier 1 even once)
   * is worth nothing, and keeping one computation is what keeps this panel
   * and the television from disagreeing about it.
   */
  pointsAtStake: number | null
  outcome: RevealOutcome | null
  winnerName: string | null
  /** True while the last judgement can still be taken back. */
  canUndo: boolean
  players: ControlPlayer[]
  /** Which deck is about to be played, and what else could be. */
  deck: ControlDeck
}

function nameOf(state: GameState, playerId: PlayerId | null): string | null {
  if (!playerId) return null
  return state.players.find((player) => player.id === playerId)?.name ?? null
}

/**
 * Projection sent to the panel.
 *
 * Pure, and given the song explicitly rather than looking it up, so the one
 * place that decides what the host's phone may see is a function with a test
 * beside it.
 */
export function toControlState(
  state: GameState,
  song: Song | null,
  room: string,
  canUndo: boolean,
  deck: ControlDeck,
): ControlState {
  const phase = state.phase
  return {
    room,
    phase: phase.kind,
    roundsPlayed: state.roundsPlayed,
    roundsTotal: state.roundsTotal,
    // Whatever song is dealt, whatever the phase: the panel is the one screen
    // in the room that is allowed to know it, and the host needs it from the
    // moment the round starts, not once the television gives it away.
    song: song ? { title: song.title, artist: song.artist, year: song.year } : null,
    buzzedName: phase.kind === 'buzzed' ? (nameOf(state, phase.playerId) ?? 'Alguien') : null,
    buzzedPoints: phase.kind === 'buzzed' ? pointsForTier(phase.worthTier) : null,
    launchTier: phase.kind === 'waiting' ? phase.launchTier : null,
    launchResumesAtMs: phase.kind === 'waiting' ? phase.resumeAtMs : null,
    pointsAtStake: pointsAtStake(phase),
    outcome: phase.kind === 'revealed' ? phase.outcome : null,
    winnerName: phase.kind === 'revealed' ? nameOf(state, phase.winnerId) : null,
    canUndo,
    deck,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      out: state.lockedOut.includes(player.id),
    })),
  }
}
