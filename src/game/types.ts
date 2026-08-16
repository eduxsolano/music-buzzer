import type { Tier } from '@/game/tiers'

export type PlayerId = string

export interface Player {
  id: PlayerId
  name: string
  score: number
}

export interface Song {
  id: string
  videoId: string
  title: string
  /**
   * The credit as it is read out on the card: "Lady Gaga & Bruno Mars",
   * "Kendrick Lamar with SZA". Kept beside `artists` rather than rebuilt from
   * it, because the words between the names are MusicBrainz's editorial choice
   * per credit and a list joined with a fixed separator reads wrong.
   */
  artist: string
  /**
   * The same credit as separate performers, so filtering by artist is a set
   * membership test and not a substring search. Never empty. For a song
   * MusicBrainz could not confidently name it holds the whole credit as its
   * single entry — splitting a YouTube-derived string on punctuation would
   * turn "Earth, Wind & Fire" into three artists that do not exist, and this
   * deck resolves that kind of doubt to nothing rather than to a guess.
   */
  artists: string[]
  year: number
  startSeconds: number
  /**
   * The MusicBrainz release-group id, when the song was confidently matched.
   * Absent otherwise. This is the key every later enrichment is a direct fetch
   * from — see src/songs/enrich.ts for why the release group is the entity
   * worth keeping and the recording is not.
   */
  releaseGroupId?: string
  /** MusicBrainz's most-voted genres, absent when it has none. Most-voted first. */
  genres?: string[]
  /**
   * Keys of the imported YouTube playlists this song came from — see
   * `src/songs/playlists.ts`. A list, not a single value, because the two
   * chart playlists genuinely share 35 songs and a song in both belongs to
   * both: filtering by either must find it. Absent, never empty, for the
   * handful of songs that predate the imports and came from no playlist at
   * all; those are honestly of unknown origin rather than assigned to a
   * bucket, so they only ever play as part of the whole deck.
   */
  playlists?: string[]
  /**
   * Path to the cover downloaded into `public/covers`, absent when there is
   * none. The television shows it at reveal time; it never crosses into the
   * public channel or a player page, because a sleeve names a song instantly.
   */
  cover?: string
}

export type RevealOutcome = 'correct' | 'allWrong' | 'timeout' | 'skipped'

/**
 * The three facts that describe every silence in a round.
 *
 * They are stored, never derived, because deriving them is exactly where the
 * rules stop being readable: "which tier was the previous one" and "was this
 * silence a pause or a cut" are questions no reader of this file should have
 * to answer. `waiting` and `buzzed` both carry them, which is the point — a
 * buzz is a silence with a name attached, and judging it wrong hands the same
 * three facts straight back.
 */
export interface Stakes {
  /** What a press is worth *right now*. Frozen at the press on `buzzed`. */
  worthTier: Tier
  /** The tier the host's launch button will sound. */
  launchTier: Tier
  /** Millisecond inside `launchTier` at which playback resumes; 0 for a fresh tier. */
  resumeAtMs: number
}

export type Phase =
  | { kind: 'lobby' }
  | ({ kind: 'waiting' } & Stakes)
  | { kind: 'playing'; tier: Tier; elapsedMs: number }
  | ({ kind: 'buzzed'; playerId: PlayerId } & Stakes)
  | { kind: 'revealed'; outcome: RevealOutcome; winnerId: PlayerId | null }
  | { kind: 'finished' }

export interface GameState {
  players: Player[]
  /** Song ids not yet played, already shuffled. */
  deck: string[]
  currentSongId: string | null
  roundsPlayed: number
  roundsTotal: number
  /** Players eliminated from the CURRENT song only. Cleared on every new round. */
  lockedOut: PlayerId[]
  phase: Phase
}

export type GameEvent =
  | { type: 'JOIN'; playerId: PlayerId; name: string }
  | { type: 'START_GAME'; deck: string[]; roundsTotal: number }
  /** The host sounds the tier the current `waiting` phase is holding. */
  | { type: 'LAUNCH_TIER' }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'BUZZ'; playerId: PlayerId }
  | { type: 'JUDGE'; correct: boolean }
  | { type: 'SKIP_SONG' }
  | { type: 'NEXT_ROUND' }
  /**
   * Abandons the game in progress and returns the room to its pre-start
   * state: scores zeroed, deck emptied (the host reshuffles and re-deals via
   * `START_GAME`, same as the first game), nothing playing, nobody
   * eliminated. The room code and the players themselves are untouched — this
   * is not a new room, it is the same room agreeing to play again.
   */
  | { type: 'NEW_SESSION' }
