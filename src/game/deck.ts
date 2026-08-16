import { shuffle } from '@/game/random'
import type { Phase } from '@/game/types'

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

/** What `recordRoundIfDecided` did, so the caller knows whether to persist. */
export interface RecordRoundResult {
  recorded: boolean
  /** The song id recorded, or the caller's `lastRecordedSongId` unchanged when nothing was recorded. */
  lastRecordedSongId: string | null
  /** The room's memory after this call — identical to the input when `recorded` is false. */
  history: string[]
}

/**
 * Decides whether the round currently sitting in `phase` should be recorded
 * as played, and returns the (possibly updated) history alongside that
 * decision.
 *
 * A round counts once its phase is `revealed` with anything but `skipped` —
 * see `recordPlayed`'s caller in `src/host/useHostGame.ts` for why a skip
 * does not count.
 *
 * The tricky part is staying idempotent across undo. Ratifying a judgement
 * with ❌ then taking it back with Undo then re-judging ✅ (an ordinary
 * mis-tap recovery, see `src/host/undo.ts`) produces TWO distinct `revealed`
 * phase objects for the very same round — the reducer builds a fresh object
 * literal every time, so object identity cannot tell "the same round judged
 * twice" apart from "a new round". `currentSongId` can: it stays identical
 * across that undo/rejudge pair (nothing but `dealRound` ever changes it),
 * and always changes the moment the next round is actually dealt. Comparing
 * `currentSongId` against `lastRecordedSongId` is therefore exactly "have I
 * already recorded THIS round" — it can neither double-record within a round
 * nor skip a genuinely new one.
 */
export function recordRoundIfDecided(
  phase: Phase,
  currentSongId: string | null,
  lastRecordedSongId: string | null,
  history: readonly string[],
  limit: number,
): RecordRoundResult {
  const unchanged: RecordRoundResult = { recorded: false, lastRecordedSongId, history: [...history] }

  if (phase.kind !== 'revealed' || phase.outcome === 'skipped') return unchanged
  if (!currentSongId || currentSongId === lastRecordedSongId) return unchanged

  return {
    recorded: true,
    lastRecordedSongId: currentSongId,
    history: recordPlayed(history, [currentSongId], limit),
  }
}
