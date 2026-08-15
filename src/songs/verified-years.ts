/**
 * The durable record of song years a human has personally verified against
 * an outside source (Wikipedia, Discogs, a dated release the artist
 * confirmed...) after MusicBrainz's automated matcher either could not
 * confirm a year or confidently reported a wrong one.
 *
 * This file exists because that trust was broken twice: an out-of-band
 * re-audit reset a batch of correct years back to 0, on top of a batch it
 * clobbered before that. Nothing enforced "leave these alone" except
 * someone's memory of which ids to skip — memory that was never checked
 * into the repository and didn't survive to the next audit. This list is
 * that memory, checked in, so the next automated pass has no way to forget.
 *
 * Add an entry whenever you personally check a song's year against a real
 * outside source and MusicBrainz's automated pipeline either can't confirm
 * it or confidently disagrees. See src/songs/musicbrainz.ts's
 * chooseYearFromReleaseGroups docstring for the two documented shapes of
 * "can't confirm": a song's true first release was an earlier album
 * appearance a title-only release-group search can't find, or MusicBrainz's
 * own data is simply missing the earliest release entirely. One line, one
 * reason — "why do I believe this number" should be answerable by reading
 * the note, not by re-deriving it.
 *
 * import-playlist.ts and reaudit-years.ts both treat every id here as
 * read-only: the stored year always wins over whatever a fresh MusicBrainz
 * lookup says, and a lookup that disagrees is reported to the operator
 * rather than applied. See resolveYear.
 */
import type { Song } from '@/game/types'

export interface VerifiedYear {
  id: string
  year: number
  note: string
}

function fail(index: number, field: string, reason: string): never {
  throw new Error(`Verified year entry ${index}: ${field} ${reason}`)
}

function parseVerifiedYear(raw: unknown, index: number): VerifiedYear {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Verified year entry ${index} is not an object`)
  }
  const v = raw as Record<string, unknown>

  if (typeof v.id !== 'string' || v.id.length === 0) fail(index, 'id', 'must be a non-empty string')
  if (typeof v.year !== 'number' || !Number.isInteger(v.year) || v.year <= 0) {
    fail(index, 'year', 'must be a positive integer')
  }
  if (typeof v.note !== 'string' || v.note.length === 0) fail(index, 'note', 'must be a non-empty string')

  return { id: v.id as string, year: v.year as number, note: v.note as string }
}

export function parseVerifiedYears(raw: unknown): VerifiedYear[] {
  if (!Array.isArray(raw)) throw new Error('The verified years list must be an array')
  const entries = raw.map(parseVerifiedYear)

  const seenIds = new Set<string>()
  for (const entry of entries) {
    if (seenIds.has(entry.id)) throw new Error(`Duplicate verified year id: "${entry.id}"`)
    seenIds.add(entry.id)
  }
  return entries
}

export function verifiedYearsById(entries: VerifiedYear[]): Map<string, VerifiedYear> {
  return new Map(entries.map((entry) => [entry.id, entry]))
}

/** Verified ids that don't match any song currently in the deck — a stale entry worth checking (song removed, or id renamed). */
export function unknownVerifiedIds(entries: VerifiedYear[], songs: Song[]): string[] {
  const songIds = new Set(songs.map((s) => s.id))
  return entries.filter((entry) => !songIds.has(entry.id)).map((entry) => entry.id)
}

/**
 * Decides what a song's year should be once a fresh MusicBrainz lookup has
 * run, given whatever the verified list says (if anything) and the song's
 * current stored value.
 *
 * A verified id always wins, unconditionally:
 * - if the stored value has drifted from the verified one (e.g. an
 *   out-of-band process wrote over it before this protection existed, or
 *   ever will again despite it), the verified value is restored —
 *   `restored` reports that, so the caller can tell the operator a
 *   correction happened rather than silently overwriting songs.json.
 * - if the fresh lookup disagrees with the verified value (finds a
 *   different, non-zero year), that lookup result is discarded, never
 *   applied — `disagreement` reports that, so the caller can tell the
 *   operator MusicBrainz thinks something different, without ever acting
 *   on it. A lookup that simply found nothing (year 0) is not treated as a
 *   disagreement: it is MusicBrainz being unable to confirm anything,
 *   which is not evidence against a value a human already checked against
 *   an outside source — the standing rule is that ambiguity resolves to 0,
 *   never to a guess, and this file's whole purpose is to sit above that
 *   rule, not be governed by it.
 *
 * A song with no verified entry passes the lookup result straight through,
 * unchanged from the behaviour before this file existed.
 */
export interface YearResolution {
  year: number
  restored: boolean
  disagreement: boolean
}

export function resolveYear(
  verified: VerifiedYear | undefined,
  currentYear: number,
  lookupYear: number,
): YearResolution {
  if (!verified) return { year: lookupYear, restored: false, disagreement: false }

  return {
    year: verified.year,
    restored: currentYear !== verified.year,
    disagreement: lookupYear !== 0 && lookupYear !== verified.year,
  }
}
