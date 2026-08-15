/**
 * The decision logic behind the full deck re-audit (see
 * scripts/reaudit-years.ts for the thin, network-calling wrapper around
 * this). Unlike import-playlist.ts's incremental pass, a re-audit re-checks
 * every song, filled or not — which is exactly the shape of process that
 * clobbered hand-verified years twice before src/songs/verified-years.ts
 * existed. This module is what makes that safe: every song is resolved
 * through resolveYear, so a verified id can never be overwritten by
 * whatever a fresh lookup returns, no matter how this function is driven.
 *
 * `lookupYear` is injected rather than called directly so this stays a pure
 * decision function, testable without a network — the real MusicBrainz
 * client (rate limit, retries, User-Agent) lives in
 * scripts/musicbrainz-client.ts.
 */
import type { Song } from '@/game/types'
import { resolveYear, verifiedYearsById, type VerifiedYear } from './verified-years'

export interface AuditEntry {
  id: string
  before: number
  after: number
  lookupYear: number
  restored: boolean
  disagreement: boolean
}

export interface AuditResult {
  entries: AuditEntry[]
  newlyFilled: number
  corrected: number
  revertedToZero: number
  confirmedUnchanged: number
  restored: number
  /** Entries where a verified song's stored year and a fresh lookup disagree — never applied, always reported. */
  disagreements: AuditEntry[]
}

export type LookupYear = (artist: string, title: string) => Promise<number>

/**
 * Re-checks every song in `songs` against `lookupYear`, mutating each
 * song's `year` in place to the resolved value (see resolveYear) and
 * returning a report of what changed. A song on the verified list never
 * ends up with anything other than its verified year, regardless of what
 * `lookupYear` returns for it.
 */
export async function auditYears(
  songs: Song[],
  verified: VerifiedYear[],
  lookupYear: LookupYear,
  onProgress?: (song: Song, index: number, total: number) => void,
): Promise<AuditResult> {
  const verifiedById = verifiedYearsById(verified)
  const entries: AuditEntry[] = []
  let newlyFilled = 0
  let corrected = 0
  let revertedToZero = 0
  let confirmedUnchanged = 0
  let restoredCount = 0

  for (let index = 0; index < songs.length; index += 1) {
    const song = songs[index]
    const before = song.year
    const lookup = await lookupYear(song.artist, song.title)
    const verifiedEntry = verifiedById.get(song.id)
    const resolution = resolveYear(verifiedEntry, before, lookup)
    song.year = resolution.year

    if (resolution.restored) restoredCount += 1

    // Coverage tallies only make sense for songs the matcher is actually
    // allowed to decide — a verified song's year was never "corrected" or
    // "reverted to 0" by MusicBrainz, it was protected from it.
    if (!verifiedEntry) {
      if (resolution.year > 0 && before === 0) newlyFilled += 1
      else if (resolution.year > 0 && before !== resolution.year) corrected += 1
      else if (resolution.year > 0) confirmedUnchanged += 1
      else if (before !== 0) revertedToZero += 1
    }

    entries.push({
      id: song.id,
      before,
      after: song.year,
      lookupYear: lookup,
      restored: resolution.restored,
      disagreement: resolution.disagreement,
    })
    onProgress?.(song, index, songs.length)
  }

  return {
    entries,
    newlyFilled,
    corrected,
    revertedToZero,
    confirmedUnchanged,
    restored: restoredCount,
    disagreements: entries.filter((entry) => entry.disagreement),
  }
}
