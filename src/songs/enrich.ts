/**
 * Pure helpers for pinning a song to a MusicBrainz entity and reading the
 * catalogue facts off it: its canonical title, its artist credit as both a
 * display string and a list, and its genres.
 *
 * The network calls live in scripts/musicbrainz-client.ts, same as the year
 * lookup, so everything here is plain data in, plain data out.
 *
 * ## Why the release group, and not the recording
 *
 * A song has exactly one release group worth naming and a dozen recordings:
 * the album take, the radio edit, the remaster, a live version, whatever a
 * mistagged upload created. Asking "which recording is this?" has no confident
 * answer for most songs — the same fragmentation that made the year matcher
 * report a 1995 reissue for "Smells Like Teen Spirit" (see
 * chooseYearFromReleaseGroups) would make it pick an arbitrary one here. The
 * release group is MusicBrainz's own reconciliation of every edition of a work
 * into one entity, and it is the entity the two things we actually want hang
 * off:
 *
 * - **Cover art.** The Cover Art Archive is keyed by release and release
 *   group; `/release-group/{mbid}/front-250` returns the front of the release
 *   MusicBrainz considers most representative. There is no recording endpoint,
 *   because a recording has no sleeve.
 * - **Genre.** MusicBrainz's genre tags are voted on release groups (and
 *   artists and works); a recording carries them far more rarely.
 *
 * It is also the id the year discipline is already built around, so a future
 * enrichment pass asks the same entity the same way rather than reconciling
 * two different keys. Keeping both ids would mean storing a recording id that
 * nothing reads and that we could not choose confidently anyway — provenance
 * dressed up as data. One id, the one everything else is reachable from.
 */
import { cleanTitle } from './import'
import {
  artistCreditMatches,
  artistNames,
  isCleanReleaseGroup,
  normalize,
  stripFeatureCredit,
} from './musicbrainz'

/** Raw shape of one `/release-group?fmt=json` search hit, trimmed to what we read. */
export interface MusicBrainzReleaseGroupHit {
  id?: string
  title?: string
  score?: number
  'first-release-date'?: string
  'primary-type'?: string
  'secondary-types'?: string[]
  'artist-credit'?: { name?: string; joinphrase?: string }[]
}

/** One release group, in the shape chooseIdentity compares. */
export interface IdentityCandidate {
  id: string
  title: string
  /**
   * Every credited performer in order, exactly as MusicBrainz names them and
   * without the join phrases between them. This is the list the deck stores.
   */
  artists: string[]
  /**
   * The credit with its join phrases intact — "Lady Gaga & Bruno Mars",
   * "Kendrick Lamar with SZA". Kept alongside the list because MusicBrainz
   * chose those words per credit and rebuilding them from the list produces
   * credits that read wrong.
   */
  artistCredit: string
  score: number
  firstReleaseDate?: string
  primaryType?: string
  secondaryTypes: string[]
}

/** What a confident match tells us about a song. */
export interface SongIdentity {
  releaseGroupId: string
  title: string
  /** The display credit, join phrases and all. */
  artist: string
  /** The same credit as separate names, for filtering and matching. */
  artists: string[]
}

/** Extracts the fields we compare from one raw search hit. */
export function toIdentityCandidate(hit: MusicBrainzReleaseGroupHit): IdentityCandidate {
  const credit = hit['artist-credit'] ?? []
  return {
    id: hit.id ?? '',
    title: hit.title ?? '',
    artists: credit.map((part) => part.name ?? '').filter((name) => name.length > 0),
    artistCredit: credit.map((part) => `${part.name ?? ''}${part.joinphrase ?? ''}`).join('').trim(),
    score: hit.score ?? 0,
    firstReleaseDate: hit['first-release-date'],
    primaryType: hit['primary-type'],
    secondaryTypes: hit['secondary-types'] ?? [],
  }
}

/**
 * The same floor MIN_SCORE_RELEASE_GROUP is for years, and for the same
 * reason: once a candidate has passed the exact title match, the artist match
 * and the clean-type filter, its relevance score has already done its job of
 * ranking candidates against each other. It is a noise screen, not the gate.
 */
const MIN_SCORE = 50

/** Sorts undated candidates last; dated ones earliest-first. */
function byReleaseDate(a: IdentityCandidate, b: IdentityCandidate): number {
  const left = a.firstReleaseDate ?? ''
  const right = b.firstReleaseDate ?? ''
  if (left === right) return 0
  if (left === '') return 1
  if (right === '') return -1
  return left < right ? -1 : 1
}

/** The names a candidate is credited to, reduced to a comparable key. */
function artistKey(candidate: IdentityCandidate): string {
  return candidate.artists.map(normalize).join('|')
}

/**
 * True when the deck's own text already knows about every performer the
 * candidate credits — either in the artist field ("Lady Gaga, Bruno Mars") or
 * inside the title, where YouTube uploads habitually park them ("Cold feat.
 * Post Malone").
 *
 * This is the corroboration rule, and it exists because of the same blind spot
 * that `combineYearSources` guards against on the year side. Our query can only
 * find release groups *titled after the song*, so when a song's original
 * release was an album track, the only release group with that title is often a
 * later standalone single — and when that later single is a **collaboration**,
 * MusicBrainz's only clean answer credits an artist who is not on the recording
 * the deck actually plays. Three real cases, all confirmed live against
 * MusicBrainz:
 *
 *   - "Ravyn Lenae" / "Love Me Not": the only clean, exact-title release group
 *     is credited "Ravyn Lenae & Rex Orange County" — a later collaborative
 *     single. The solo original is an album track this search cannot reach.
 *   - "Teddy Swims" / "The Door": the only clean, exact-title release group is
 *     credited "Teddy Swims & Tiago PZK". Every solo release group of that name
 *     is typed Remix, and the solo original is again an album track.
 *   - "Luis Fonsi" / "Despacito": the only clean, exact-title release group is
 *     credited "Luis Fonsi ft. Daddy Yankee" — and here that IS the original
 *     single, correctly credited.
 *
 * Nothing in the data separates the third case from the first two: all three
 * are a lone clean release group crediting one more artist than the deck does.
 * So this rule rejects all three, losing one genuine improvement to prevent two
 * cards that would confidently announce the wrong artist to a room. That is the
 * standing trade in this deck — coverage is expendable; a confident wrong value
 * is the failure being designed against.
 *
 * The test is containment against the deck's normalized text rather than an
 * exact comparison, because the deck's text is prose ("SHE DID IT AGAIN ft.
 * Zara Larsson"), not a structured credit.
 */
function everyNameVouchedFor(candidate: IdentityCandidate, deckText: string): boolean {
  return candidate.artists.every((name) => deckText.includes(normalize(name)))
}

/**
 * Picks the one release group this song *is*, or null when MusicBrainz is not
 * confident which one that is.
 *
 * A candidate has to clear the same three bars a year does — exact normalized
 * title, artist credit that matches every credited performer, and a clean
 * Single/Album/EP with no secondary type (not a live album, remix bundle,
 * compilation or soundtrack tie-in that happens to share a title). Those are
 * deliberately the same rules as chooseYearFromReleaseGroups, read from the
 * same helpers, because a candidate good enough to name a song is exactly a
 * candidate good enough to date it.
 *
 * Then two extra rules this function needs and the year one does not, both of
 * them the same idea from different sides — a name is a stronger claim than a
 * date, so it needs more than MusicBrainz's word for it:
 *
 *   1. Every performer the candidate credits must already be named somewhere in
 *      the deck's own artist field or title. See everyNameVouchedFor for the
 *      three live cases that produced this and for what it costs.
 *   2. If the surviving candidates are not all credited to the same set of
 *      artists, they are not all the same song, and there is no way to tell
 *      which one the deck means.
 *
 * Either failure resolves to null — the caller keeps the rough YouTube-derived
 * title and artist it already had. The asymmetry is the same one that governs
 * years: a rough guess that looks rough is harmless, a confident wrong
 * canonical name is not. Nobody is hurt by a card that says "Post Malone" when
 * MusicBrainz would say "Post Malone feat. Morgan Wallen"; a card that
 * confidently says the wrong artist entirely ends a round in an argument.
 *
 * Among candidates that agree, the earliest-released wins (the original
 * pressing rather than a reissue, the same "earliest is the original" reading
 * the year code uses), then the higher relevance score, then the lower id so
 * that two runs over the same data always choose the same entity. Undated
 * candidates sort last: a release group with no date at all is the weakest
 * claim to being the original edition.
 */
export function chooseIdentity(
  candidates: IdentityCandidate[],
  artist: string,
  title: string,
): SongIdentity | null {
  const wantTitle = normalize(stripFeatureCredit(cleanTitle(title)))
  const names = artistNames(artist).map(normalize)
  const deckText = normalize(`${artist} ${title}`)

  const matches = candidates.filter(
    (c) =>
      c.id.length > 0 &&
      c.artists.length > 0 &&
      c.score >= MIN_SCORE &&
      isCleanReleaseGroup(c) &&
      normalize(stripFeatureCredit(cleanTitle(c.title))) === wantTitle &&
      artistCreditMatches(c.artistCredit, names) &&
      everyNameVouchedFor(c, deckText),
  )
  if (matches.length === 0) return null

  const keys = new Set(matches.map(artistKey))
  if (keys.size > 1) return null

  const best = [...matches].sort(
    (a, b) => byReleaseDate(a, b) || b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0]

  return {
    releaseGroupId: best.id,
    title: best.title,
    artist: best.artistCredit,
    artists: best.artists,
  }
}

/** Raw shape of one entry in a release group's `genres` array. */
export interface MusicBrainzGenre {
  name?: string
  count?: number
}

/**
 * At most this many genres per song. MusicBrainz will happily return eight
 * tags for a chart single, most of them one vote deep; a deck selector needs
 * the handful that actually describe the song, not its whole tag cloud.
 */
const MAX_GENRES = 3

/**
 * The genres a song is stored with: the most-voted first, ties broken
 * alphabetically so a rerun over unchanged data produces an unchanged file.
 *
 * A tag with no votes is dropped. MusicBrainz's genre list is user-voted and
 * `count` is how many people stood behind it; a zero means the tag exists in
 * the data but nobody has affirmed it, which is not evidence of anything.
 */
export function chooseGenres(genres: MusicBrainzGenre[] | undefined): string[] {
  return (genres ?? [])
    .filter((genre) => (genre.name ?? '').length > 0 && (genre.count ?? 0) > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''))
    .slice(0, MAX_GENRES)
    .map((genre) => genre.name as string)
}

/** Where a song's downloaded cover lives, as the browser asks for it. */
export function coverPath(songId: string): string {
  return `/covers/${songId}.jpg`
}
