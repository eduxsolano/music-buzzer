/**
 * Thin MusicBrainz network client shared by import-playlist.ts and
 * reaudit-years.ts. All matching/decision logic lives in
 * src/songs/musicbrainz.ts (pure, unit tested); this file only knows how to
 * make the two HTTP requests, obey MusicBrainz's rate limit and User-Agent
 * policy, and retry a transient 503.
 */
import {
  buildRecordingQuery,
  buildReleaseGroupQuery,
  chooseYear,
  chooseYearFromReleaseGroups,
  combineYearSources,
  toCandidate,
  toReleaseGroupCandidate,
  type MusicBrainzRecording,
  type MusicBrainzReleaseGroup,
  type ReleaseGroupYearResult,
} from '../src/songs/musicbrainz'
import {
  chooseGenres,
  chooseIdentity,
  toIdentityCandidate,
  type MusicBrainzGenre,
  type MusicBrainzReleaseGroupHit,
  type SongIdentity,
} from '../src/songs/enrich'

/**
 * MusicBrainz's own policy: "All users of the API must ensure that each of
 * their client applications never make more than ONE call per second."
 * We wait a little longer than one second to stay safely clear of that.
 */
export const MUSICBRAINZ_DELAY_MS = 1100

/**
 * MusicBrainz: "Each request sent to MusicBrainz needs to include a User-Agent
 * header, with enough information in the User-Agent for us (MusicBrainz) to
 * contact the application maintainers" — hence the app name, version and a
 * contact email below, not a generic/default library User-Agent.
 */
const MUSICBRAINZ_USER_AGENT = 'HitsterBuzzer/0.1 (eduardoasolanog@gmail.com)'

/**
 * MusicBrainz occasionally answers a well-behaved, one-per-second client
 * with a transient 503 (server-side load, not something we caused). Treating
 * that as "no match" would wrongly send a real song to manual review, so a
 * 503 gets a couple of backed-off retries before we give up on it.
 */
const MUSICBRAINZ_MAX_ATTEMPTS = 3

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * MusicBrainz's relevance ranking is not date-ordered, and a hot chart song
 * can have a dozen near-duplicate entries (singles, remixes, live takes,
 * even mistagged or vandalized ones); a low result count risks the correct
 * earliest recording simply not being in the page we look at.
 */
const MUSICBRAINZ_SEARCH_LIMIT = 15

/**
 * Fetches one MusicBrainz search URL, retrying a transient 503 (their own
 * signal for "you're overloading us right now", confirmed to happen even to
 * a well-behaved, spaced-out client — see MUSICBRAINZ_MAX_ATTEMPTS) with
 * backoff. Returns the parsed body, or null if every attempt failed.
 */
async function fetchMusicBrainzJson(url: URL): Promise<unknown | null> {
  for (let attempt = 1; attempt <= MUSICBRAINZ_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': MUSICBRAINZ_USER_AGENT } })
    if (response.ok) return response.json()
    const canRetry = response.status === 503 && attempt < MUSICBRAINZ_MAX_ATTEMPTS
    if (!canRetry) return null
    await sleep(MUSICBRAINZ_DELAY_MS * attempt)
  }
  return null
}

/**
 * Primary source: MusicBrainz's own reconciliation of every edition of a
 * work into one release group, whose first-release-date is already the
 * earliest of those editions — see chooseYearFromReleaseGroups for why
 * that beats asking about individual recordings, and for why its result is
 * a claim rather than a final answer when singleTypeOnly is true.
 */
async function lookupYearFromReleaseGroups(artist: string, title: string): Promise<ReleaseGroupYearResult> {
  const url = new URL('https://musicbrainz.org/ws/2/release-group/')
  url.searchParams.set('query', buildReleaseGroupQuery(artist, title))
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', String(MUSICBRAINZ_SEARCH_LIMIT))

  const body = (await fetchMusicBrainzJson(url)) as { 'release-groups'?: MusicBrainzReleaseGroup[] } | null
  if (!body) return { year: 0, singleTypeOnly: false }
  const candidates = (body['release-groups'] ?? []).map(toReleaseGroupCandidate)
  return chooseYearFromReleaseGroups(candidates, artist, title)
}

/**
 * Secondary source: sees every individual recording of the song regardless
 * of which release or release group it belongs to, including an earlier
 * album appearance a title-based release-group search cannot find — see
 * combineYearSources for exactly how the two are reconciled.
 */
async function lookupYearFromRecordings(artist: string, title: string): Promise<number> {
  const url = new URL('https://musicbrainz.org/ws/2/recording/')
  url.searchParams.set('query', buildRecordingQuery(artist, title))
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', String(MUSICBRAINZ_SEARCH_LIMIT))

  const body = (await fetchMusicBrainzJson(url)) as { recordings?: MusicBrainzRecording[] } | null
  if (!body) return 0
  const candidates = (body.recordings ?? []).map(toCandidate)
  return chooseYear(candidates, artist, title)
}

/**
 * Looks up a song's release year on MusicBrainz. Always asks the
 * release-group search first. The recording search is skipped only when
 * the release group already answered with an Album/EP behind it
 * (combineYearSources trusts that outright) — every other case, including
 * no release-group answer at all, spends the second request: a
 * Single-only release-group year is a claim, not an answer, until the
 * recording search either fails to contradict it or actively confirms an
 * earlier date (see combineYearSources).
 *
 * Callers are responsible for the rate-limit sleep between songs (and, for
 * the second request within this function, between it and whatever request
 * came before it) — see MUSICBRAINZ_DELAY_MS.
 */
export async function lookupYear(artist: string, title: string): Promise<number> {
  const fromReleaseGroups = await lookupYearFromReleaseGroups(artist, title)
  if (fromReleaseGroups.year > 0 && !fromReleaseGroups.singleTypeOnly) {
    return fromReleaseGroups.year
  }

  await sleep(MUSICBRAINZ_DELAY_MS)
  const fromRecordings = await lookupYearFromRecordings(artist, title)
  return combineYearSources(fromReleaseGroups, fromRecordings)
}

/**
 * Finds the release group a song *is*, or null when MusicBrainz is not
 * confident which one that is (see chooseIdentity). Same search endpoint and
 * same query the year lookup uses — one request, and the decision is made off
 * the network in src/songs/enrich.ts.
 *
 * `null` is also what a failed request produces, deliberately: the caller
 * leaves the song exactly as it found it either way, so a MusicBrainz outage
 * costs coverage on a rerun and never costs correctness.
 */
export async function lookupIdentity(artist: string, title: string): Promise<SongIdentity | null> {
  const url = new URL('https://musicbrainz.org/ws/2/release-group/')
  url.searchParams.set('query', buildReleaseGroupQuery(artist, title))
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', String(MUSICBRAINZ_SEARCH_LIMIT))

  const body = (await fetchMusicBrainzJson(url)) as { 'release-groups'?: MusicBrainzReleaseGroupHit[] } | null
  if (!body) return null
  return chooseIdentity((body['release-groups'] ?? []).map(toIdentityCandidate), artist, title)
}

/**
 * Reads a release group's genres. The search endpoint cannot return them, so
 * this is a second request against the entity we just identified — which is
 * the whole reason the id is worth storing: every enrichment after this one is
 * this direct lookup rather than another fuzzy search.
 *
 * An empty array means both "MusicBrainz has no genres for this" and "the
 * request failed"; the caller cannot act differently on the two anyway, since
 * neither is grounds for inventing one.
 */
export async function lookupGenres(releaseGroupId: string): Promise<string[]> {
  const url = new URL(`https://musicbrainz.org/ws/2/release-group/${releaseGroupId}`)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('inc', 'genres')

  const body = (await fetchMusicBrainzJson(url)) as { genres?: MusicBrainzGenre[] } | null
  return chooseGenres(body?.genres)
}
