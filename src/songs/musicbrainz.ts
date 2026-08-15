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
 * Only used for a single-performer credit — see MIN_SCORE_MULTI_ARTIST for
 * why a collaboration needs a different bar.
 */
const MIN_SCORE = 90

/**
 * The score floor for a multi-performer credit, deliberately lower than
 * MIN_SCORE. Evidence from two real, live-verified wrong-year cases (see
 * chooseYear's docstring) showed MusicBrainz's own relevance score is not a
 * reliable signal here: querying by one performer's name (searchArtist is
 * always primaryArtist — see buildRecordingQuery) makes a *correctly*
 * co-credited recording score in the low 80s purely because the query text
 * only matches part of its artist-credit field, while an unrelated,
 * mistagged recording credited to that one performer alone scores 100 for
 * matching the query text exactly. Score cannot tell those two apart; only
 * checking that *every* performer's name actually appears in the
 * candidate's own artist-credit can. That check is the real gate for a
 * multi-performer credit; this floor only screens out obvious noise.
 */
const MIN_SCORE_MULTI_ARTIST = 50

/**
 * How many years apart matching candidates may span before we call them
 * unreliable rather than variant releases of the same recording.
 */
const MAX_YEAR_SPREAD = 5

/**
 * Minimum number of independently-dated matching candidates required before
 * trusting their earliest date. Found live, on "Nirvana" / "Smells Like Teen
 * Spirit": MusicBrainz returned fifteen score-100, title-and-artist-matching
 * candidates, fourteen of them with no `first-release-date` at all and
 * exactly one dated 1995 — eight years after the real 1991 release. A single
 * data point is not corroboration, however high its score, and the previous
 * "earliest of whatever survives" logic confidently reported that lone 1995
 * as the answer. Requiring at least two independent dates that agree (within
 * MAX_YEAR_SPREAD) makes an isolated stray/mistagged/vandalized date fall
 * back to 0 instead of being reported as fact.
 */
const MIN_DATED_MATCHES = 2

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

/**
 * A YouTube title's artist field is often several performers joined the way
 * the uploader felt like ("A, B", "A & B", "A feat. B", "A with B", "A x B").
 * "with" is a real MusicBrainz join phrase too (e.g. "Kendrick Lamar with
 * SZA") — omitting it from this list was the cause of one confirmed wrong
 * year (see chooseYear's docstring): a song whose own credit split cleanly
 * on other separators still needed every one of MusicBrainz's real join
 * words recognised to split fully. "x" is included for the same reason
 * (seen in this deck as "Tyla x Wizkid"); the risk is a rare artist name
 * that is itself just the letter "x" surrounded by spaces (e.g. a band
 * whose name starts with "X"), which would be mis-split. None of that
 * shape exists in this deck today, and a mis-split degrades to "no match"
 * (year stays 0) rather than a wrong one, so it is an acceptable trade.
 *
 * "feat"/"ft"/"vs" use `(?:\.|\b)` rather than a trailing `\b` after their
 * optional period: a `\b` can never match between two non-word characters
 * (a literal "." followed by a space), so a straightforward `feat\.?\b`
 * silently fails to match "feat." and matches only the period-less "feat" —
 * the same bug FEATURE_CREDIT had before it was fixed. Letting the period
 * itself satisfy the boundary when present, and requiring a real `\b`
 * boundary only when it's absent (so "ft" doesn't cut into "Ftampa"), gets
 * both cases right.
 */
const ARTIST_SEPARATOR = /,|&|\b(?:feat|ft|vs)(?:\.|\b)|\bfeaturing\b|\bwith\b|\band\b|\bx\b/i

/** Splits a possibly multi-performer credit into its individual names. */
export function artistNames(artist: string): string[] {
  return artist
    .split(ARTIST_SEPARATOR)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

export function primaryArtist(artist: string): string {
  return artistNames(artist)[0] ?? artist.trim()
}

/**
 * A feature credit inside the title itself ("Cold feat. Post Malone",
 * "Raindance (ft. Tems)") is common in YouTube titles but rarely part of
 * MusicBrainz's stored title, so it is stripped for matching purposes only
 * — the song's own title field keeps it, since it is useful on the card.
 * The `\b` before feat/ft keeps this from cutting into an unrelated word
 * that merely contains those letters (e.g. "Defeat", "wgft"). There is no
 * `\b` after the optional period: a boundary can't exist between two
 * non-word characters ("." then a space), so the mandatory `\s+` that
 * follows already does that job.
 */
const FEATURE_CREDIT = /\s*[([]?\s*\b(?:feat\.?|ft\.?|featuring)\s+[^()[\]]*[)\]]?\s*$/i

export function stripFeatureCredit(title: string): string {
  return title.replace(FEATURE_CREDIT, '').trim()
}

/** Builds the Lucene query MusicBrainz's `/recording` search endpoint expects. */
export function buildRecordingQuery(artist: string, title: string): string {
  const searchArtist = primaryArtist(artist)
  const searchTitle = stripFeatureCredit(cleanTitle(title))
  return `recording:"${escapeLucene(searchTitle)}" AND artist:"${escapeLucene(searchArtist)}"`
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
 * The fields we use out of one entry in MusicBrainz's `/release-group`
 * search results. A release group is MusicBrainz's own reconciliation of
 * every edition of a work (the original single, the album, compilations,
 * remasters, per-country pressings) into one entity whose own
 * `first-release-date` is already computed as the earliest of those —
 * see chooseYearFromReleaseGroups for why that is a fundamentally better
 * question to ask than any individual recording's date.
 */
export interface ReleaseGroupCandidate {
  title: string
  artistCredit: string
  firstReleaseDate?: string
  score: number
  primaryType?: string
  secondaryTypes: string[]
}

/** Raw shape of one entry in the `/release-group?fmt=json` response, trimmed to what we read. */
export interface MusicBrainzReleaseGroup {
  title?: string
  score?: number
  'first-release-date'?: string
  'primary-type'?: string
  'secondary-types'?: string[]
  'artist-credit'?: { name?: string; joinphrase?: string }[]
}

/** Builds the Lucene query MusicBrainz's `/release-group` search endpoint expects. */
export function buildReleaseGroupQuery(artist: string, title: string): string {
  const searchArtist = primaryArtist(artist)
  const searchTitle = stripFeatureCredit(cleanTitle(title))
  return `releasegroup:"${escapeLucene(searchTitle)}" AND artist:"${escapeLucene(searchArtist)}"`
}

/** Extracts the fields we care about from one raw release-group search result. */
export function toReleaseGroupCandidate(releaseGroup: MusicBrainzReleaseGroup): ReleaseGroupCandidate {
  const artistCredit = (releaseGroup['artist-credit'] ?? [])
    .map((part) => `${part.name ?? ''}${part.joinphrase ?? ''}`)
    .join('')
  return {
    title: releaseGroup.title ?? '',
    artistCredit,
    firstReleaseDate: releaseGroup['first-release-date'],
    score: releaseGroup.score ?? 0,
    primaryType: releaseGroup['primary-type'],
    secondaryTypes: releaseGroup['secondary-types'] ?? [],
  }
}

/**
 * A release group only counts as "the original work" — as opposed to a
 * live album, a remix bundle, a compilation, a soundtrack tie-in, or a DJ
 * mix that happens to share its title and artist — when it is a plain
 * Single, Album or EP with no secondary type at all. MusicBrainz gives us
 * this as structured data, which is exactly what title-text filtering
 * (cleanTitle's PROMO_NOISE) was always an approximation of.
 */
const CLEAN_RELEASE_GROUP_TYPES = new Set(['Single', 'Album', 'EP'])

function isCleanReleaseGroup(candidate: ReleaseGroupCandidate): boolean {
  return (
    candidate.primaryType !== undefined &&
    CLEAN_RELEASE_GROUP_TYPES.has(candidate.primaryType) &&
    candidate.secondaryTypes.length === 0
  )
}

/**
 * The score floor for a release-group match. Deliberately low: once a
 * candidate has passed the exact title match, the exact (or, for a
 * collaboration, full-name-corroborated) artist match, and the "clean
 * type" filter above, its relevance score has already done its job of
 * ranking candidates against each other — it is not additional evidence
 * the way MIN_SCORE is for a loosely-matched recording.
 */
const MIN_SCORE_RELEASE_GROUP = 50

/**
 * Picks a year only when confident. A candidate must have a title match
 * (normalized, feature-credit stripped) to be considered at all, and then
 * an artist match whose shape depends on how many performers the song was
 * actually credited to:
 *
 * - A single-performer credit matches a candidate on its primary artist
 *   (reduced the same way), gated by MIN_SCORE. This is the simple case
 *   and was never the problem.
 *
 * - A multi-performer credit ("A, B", "A & B", "A with B", ...) requires
 *   the candidate's *raw, unreduced* artist-credit string to contain every
 *   one of those names, gated by the much lower MIN_SCORE_MULTI_ARTIST.
 *   This is deliberately NOT a reduced/exact comparison, and deliberately
 *   NOT primarily score-gated. Two real, live-verified wrong years reached
 *   production before this rule existed:
 *
 *     - "Kendrick Lamar, SZA" / "luther" was confidently filled as 2025.
 *       The correct earliest recording was credited "Kendrick Lamar with
 *       SZA" — "with" was missing from the separator list, so it never
 *       reduced to a name this code recognised, and got silently dropped,
 *       leaving only later-dated candidates to agree with each other.
 *     - "Lady Gaga, Bruno Mars" / "Die With A Smile" was confidently filled
 *       as 2025. Querying MusicBrainz by primary artist alone surfaces
 *       mistagged solo "Lady Gaga" entries (score 100 — exact match to the
 *       query text) ahead of the correct joint "Lady Gaga & Bruno Mars"
 *       credit (score 83 — the query text only matches part of it).
 *       Reducing every candidate to its primary artist and comparing
 *       against MIN_SCORE made the wrong, higher-scoring solo entry win.
 *
 *   Requiring every credited name to actually appear on the candidate is
 *   what a human would do to catch a mistagged or wrong-pairing entry
 *   (e.g. "Bad Bunny & Lady Gaga" for a different, unrelated collab that
 *   also matches on title); score alone cannot make that distinction, so
 *   score is only a low floor here, not the gate.
 *
 * Once a candidate is accepted, MusicBrainz commonly returns several
 * *recordings* of the same song — the single, a deluxe reissue, a live
 * version — each with its own release date a few months or a year apart;
 * that is not disagreement about the song, so the earliest one is taken as
 * the original release. A spread of more than MAX_YEAR_SPREAD years between
 * accepted candidates is treated as an accidental collision between two
 * different works and falls back to 0 — same as no candidates at all, or
 * fewer than MIN_DATED_MATCHES of them actually carrying a date (see its
 * own comment for why a single dated candidate is not enough).
 * Ambiguity always resolves to 0 here, never to a guess — the caller treats
 * 0 as "leave for a human to review".
 */
export function chooseYear(
  candidates: MusicBrainzCandidate[],
  artist: string,
  title: string,
): number {
  const wantTitle = normalize(stripFeatureCredit(cleanTitle(title)))
  const names = artistNames(artist).map(normalize)
  const isMultiArtist = names.length > 1

  const matches = candidates.filter((c) => {
    if (normalize(stripFeatureCredit(cleanTitle(c.title))) !== wantTitle) return false

    if (isMultiArtist) {
      const candidateArtist = normalize(c.artistCredit)
      return c.score >= MIN_SCORE_MULTI_ARTIST && names.every((name) => candidateArtist.includes(name))
    }

    return c.score >= MIN_SCORE && normalize(primaryArtist(c.artistCredit)) === names[0]
  })

  const years = matches.map((c) => extractYear(c.firstReleaseDate)).filter((y) => y > 0)
  if (years.length < MIN_DATED_MATCHES) return 0

  const earliest = Math.min(...years)
  const latest = Math.max(...years)
  return latest - earliest <= MAX_YEAR_SPREAD ? earliest : 0
}

/**
 * Picks a year from release groups — MusicBrainz's own reconciliation of
 * every edition of a work into one entity, whose `first-release-date` is
 * already computed on their side as the earliest of those editions. This
 * is the primary source: it sidesteps the exact failure mode chooseYear
 * exists to defend against, where a song has a dozen individual
 * *recordings* (remaster, live take, radio edit...), most undated, and
 * trusting whichever ones happen to carry a date risks trusting a reissue
 * instead of the original (this is exactly how "Smells Like Teen Spirit"
 * came back 1995 instead of 1991 before MIN_DATED_MATCHES existed).
 *
 * A candidate only counts once three things are all true:
 *   1. Its title matches exactly (normalized, feature-credit stripped).
 *   2. Its artist matches — primary-artist-reduced for a solo credit, or
 *      every credited name present in its raw artist-credit for a
 *      collaboration (same rule as chooseYear, same reasons).
 *   3. isCleanReleaseGroup: a plain Single/Album/EP with no secondary
 *      type, i.e. not a live album, remix bundle, compilation or
 *      soundtrack tie-in that happens to share a title and artist.
 *
 * Unlike chooseYear, a *single* clean, matching candidate is trusted: its
 * date is not one arbitrary recording's denormalized field, it is
 * MusicBrainz's own reconciled minimum across that release group's
 * editions, which is a fundamentally stronger claim than a lone recording
 * date ever was. When more than one clean candidate matches (e.g. a
 * separate Album and Single release group for the same song) and they
 * disagree by more than MAX_YEAR_SPREAD, that is still treated as
 * unreliable and falls back to 0 — the same "ambiguity resolves to 0"
 * rule as everywhere else. Confirmed live: MusicBrainz can have no clean
 * release group for a song at all (e.g. "Kendrick Lamar" / "luther" has
 * exactly one, mistyped "Other" with a date eight months later than the
 * real release) — that correctly returns 0 here rather than trusting it,
 * and the caller falls back to chooseYear's recording-based search.
 */
export function chooseYearFromReleaseGroups(
  candidates: ReleaseGroupCandidate[],
  artist: string,
  title: string,
): number {
  const wantTitle = normalize(stripFeatureCredit(cleanTitle(title)))
  const names = artistNames(artist).map(normalize)
  const isMultiArtist = names.length > 1

  const matches = candidates.filter((c) => {
    if (c.score < MIN_SCORE_RELEASE_GROUP) return false
    if (!isCleanReleaseGroup(c)) return false
    if (normalize(stripFeatureCredit(cleanTitle(c.title))) !== wantTitle) return false

    if (isMultiArtist) {
      const candidateArtist = normalize(c.artistCredit)
      return names.every((name) => candidateArtist.includes(name))
    }

    return normalize(primaryArtist(c.artistCredit)) === names[0]
  })

  const years = matches.map((c) => extractYear(c.firstReleaseDate)).filter((y) => y > 0)
  if (years.length === 0) return 0

  const earliest = Math.min(...years)
  const latest = Math.max(...years)
  return latest - earliest <= MAX_YEAR_SPREAD ? earliest : 0
}
