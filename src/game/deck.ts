import { shuffle } from '@/game/random'

/**
 * Orders every song id for a fresh game.
 *
 * Songs absent from `recentlyPlayed` ("fresh") are shuffled and come first,
 * so a new game only reaches into recent memory once it has genuinely run
 * out of songs the room has not heard lately. Songs present in
 * `recentlyPlayed` ("stale") follow, ordered from least- to
 * most-recently-played — the graceful-degradation path for a deck too small,
 * or a night too long, to keep every game fully fresh. That ordering is
 * deterministic on purpose: when the room has to hear something again, it
 * should always be whichever song it heard longest ago, not a coin flip.
 *
 * `recentlyPlayed` is ordered oldest-first (index 0 = played longest ago),
 * matching what `recordPlayed` below produces and what persistence stores.
 * The result has exactly as many ids as `allSongIds` — same contract as the
 * plain `shuffle` this replaces — so callers slot it in unchanged.
 */
export function buildDeck(
  allSongIds: readonly string[],
  recentlyPlayed: readonly string[],
  random: () => number,
): string[] {
  const recencyRank = new Map<string, number>()
  recentlyPlayed.forEach((id, index) => recencyRank.set(id, index))

  const fresh: string[] = []
  const stale: string[] = []
  for (const id of allSongIds) {
    if (recencyRank.has(id)) {
      stale.push(id)
    } else {
      fresh.push(id)
    }
  }
  stale.sort((a, b) => (recencyRank.get(a) as number) - (recencyRank.get(b) as number))

  return [...shuffle(fresh, random), ...stale]
}

/**
 * Appends this game's played song ids (oldest first) onto the room's memory
 * and trims it down to `limit`, dropping the oldest entries first.
 *
 * `limit` bounds how far back "recently played" reaches. Too large and the
 * deck eventually empties of fresh songs entirely; too small and the second
 * game of an evening starts repeating songs from the first almost
 * immediately. See `HISTORY_LIMIT` in `src/game/config.ts` for the chosen
 * value and the reasoning behind it.
 */
export function recordPlayed(history: readonly string[], playedIds: readonly string[], limit: number): string[] {
  const combined = [...history, ...playedIds]
  return combined.length > limit ? combined.slice(combined.length - limit) : combined
}
