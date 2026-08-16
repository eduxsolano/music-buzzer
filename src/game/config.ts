export interface TierConfig {
  tier: 1 | 2 | 3
  durationMs: number
  points: number
}

/** Every tier restarts the song at `startSeconds`; durations are absolute, not cumulative. */
export const TIERS: readonly TierConfig[] = [
  { tier: 1, durationMs: 5_000, points: 5 },
  { tier: 2, durationMs: 10_000, points: 3 },
  // Tier 3 is the last chance, so it needs to be worth taking. At 1 point
  // with a 1-point wrong-answer penalty, break-even needs >50% confidence —
  // the rational move in the final tier is silence. At 2 points, break-even
  // drops to about a third, so guessing is worth it again. Shortening it to
  // 15 s (from 30 s) also cuts 15 s of new audio that used to play after the
  // room had already given up — about five minutes of dead air over a
  // 20-song game.
  { tier: 3, durationMs: 15_000, points: 2 },
] as const

export const WRONG_ANSWER_PENALTY = 1

export const DEFAULT_ROUNDS = 20

/**
 * How many songs a themed deck must hold before the host is offered it.
 *
 * **Two games' worth, not one, and the second game is the whole point.** The
 * obvious threshold is `DEFAULT_ROUNDS`: an option that cannot deal 20 songs
 * is a shortened game nobody asked for. But an option holding *exactly* 20 is
 * worse than short — it is frozen. Every song it has is played every game, so
 * after the first game every one of them sits in `recentlyPlayed` forever and
 * `buildDeck` has nothing fresh left to shuffle. The room hears the same
 * twenty songs in a near-identical order for the rest of the night. A deck
 * that cannot produce two different games is not a deck.
 *
 * So the rule is: **an option must hold enough songs that two consecutive
 * games differ.** That is `2 * DEFAULT_ROUNDS` — at 40 songs the second game
 * is dealt entirely from the 20 the first one did not touch.
 *
 * It resolves a second problem without naming it. A valid answer in this game
 * is title *and* artist, and the television names the chosen deck all game —
 * so a single-artist deck would hand the room one of the two required fields
 * for twenty rounds running. At this threshold no artist in the deck
 * qualifies, and the artist axis needs no special case to say so.
 *
 * Do NOT "simplify" this back to `DEFAULT_ROUNDS` because a game is 20 songs.
 * The two numbers answer different questions: that one is how long a game is,
 * this one is how much variety an option must have to be worth offering.
 */
export const MIN_DECK_OPTION_SONGS = 2 * DEFAULT_ROUNDS

/**
 * How many recently-played songs the host remembers when shuffling the next
 * game, so the second game of an evening does not replay the first.
 *
 * Three games' worth: long enough that a room playing back-to-back rounds
 * all evening keeps hearing new songs, short enough that the deck recovers
 * on its own — the first game's songs are only evicted from memory once the
 * fourth game has been recorded, so they are fresh again by the fifth game.
 * Kept as a multiple of `DEFAULT_ROUNDS` rather than a bare number so the
 * relationship (how many games of memory) survives if the game length ever
 * changes. It is deliberately independent of the deck's actual size:
 * `buildDeck` degrades gracefully — see its comment — when the deck is
 * smaller than this, rather than this constant needing to know about that.
 */
export const HISTORY_LIMIT = 3 * DEFAULT_ROUNDS
