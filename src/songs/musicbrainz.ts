/**
 * Pure helpers for looking up a recording's release year on MusicBrainz.
 *
 * The network call itself lives in the import script (kept thin, per
 * MusicBrainz's rate-limiting and User-Agent policy); everything here is
 * plain data in, plain data out, so it can be unit tested without a network.
 */
import { cleanTitle } from './import'

/** The fields we use out of one entry in MusicBrainz's `/recording` search results. */
export interface MusicBrainzCandidate {
  title: string
  artistCredit: string
  firstReleaseDate?: string
  score: number
}

/** Raw shape of one entry in the `/recording?fmt=json` response, trimmed to what we read. */
export interface MusicBrainzRecording {
  title?: string
  score?: number
  'first-release-date'?: string
  'artist-credit'?: { name?: string; joinphrase?: string }[]
}

/**
 * A candidate only counts as a match when both artist and title agree; below
 * this MusicBrainz relevance score the hit is too loose to trust either way.
 */
const MIN_SCORE = 90

/**
 * How many years apart matching candidates may span before we call them
 * unreliable rather than variant releases of the same recording.
 */
const MAX_YEAR_SPREAD = 5

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks left behind by NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function escapeLucene(text: string): string {
  return text.replace(/([+\-!(){}[\]^"~*?:\\/])/g, '\\$1')
}

/** Builds the Lucene query MusicBrainz's `/recording` search endpoint expects. */
export function buildRecordingQuery(artist: string, title: string): string {
  return `recording:"${escapeLucene(title)}" AND artist:"${escapeLucene(artist)}"`
}

/** Turns a MusicBrainz release date ("1991-09-10", "1991-09", "1991") into a year, or 0. */
export function extractYear(firstReleaseDate: string | undefined): number {
  const match = firstReleaseDate ? /^(\d{4})/.exec(firstReleaseDate) : null
  return match ? Number(match[1]) : 0
}

/** Extracts the fields we care about from one raw search result. */
export function toCandidate(recording: MusicBrainzRecording): MusicBrainzCandidate {
  const artistCredit = (recording['artist-credit'] ?? [])
    .map((part) => `${part.name ?? ''}${part.joinphrase ?? ''}`)
    .join('')
  return {
    title: recording.title ?? '',
    artistCredit,
    firstReleaseDate: recording['first-release-date'],
    score: recording.score ?? 0,
  }
}

/**
 * Picks a year only when confident. A candidate must have a high MusicBrainz
 * relevance score and an exact (normalized) artist and title match to count
 * at all. MusicBrainz then commonly returns several *recordings* for the
 * same song — the single, a deluxe reissue, a live version — each with its
 * own release date a few months or a year apart; that is not disagreement
 * about the song, so we take the earliest one, which is its original
 * release. Only a wide spread (likely two different works that happen to
 * share an artist and title) or no matches at all fall back to 0, which the
 * caller treats as "leave for a human to review".
 */
export function chooseYear(
  candidates: MusicBrainzCandidate[],
  artist: string,
  title: string,
): number {
  const wantArtist = normalize(artist)
  const wantTitle = normalize(cleanTitle(title))

  const matches = candidates.filter(
    (c) =>
      c.score >= MIN_SCORE &&
      normalize(c.artistCredit) === wantArtist &&
      normalize(cleanTitle(c.title)) === wantTitle,
  )

  const years = matches.map((c) => extractYear(c.firstReleaseDate)).filter((y) => y > 0)
  if (years.length === 0) return 0

  const earliest = Math.min(...years)
  const latest = Math.max(...years)
  return latest - earliest <= MAX_YEAR_SPREAD ? earliest : 0
}
