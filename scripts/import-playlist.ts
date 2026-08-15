/**
 * Turns a YouTube playlist into songs.json entries.
 *
 * Fills videoId, title and a guessed artist. startSeconds is set to a fixed
 * default (past most intros) so the deck is playable immediately; year is
 * looked up on MusicBrainz — release groups first (their own reconciled
 * "work first came out" date), with the recording search used both as a
 * fallback and, whenever the release group's only support is a Single (see
 * src/songs/musicbrainz.ts's combineYearSources), as required corroboration
 * before that date is trusted — and left at 0 — pending review — whenever
 * nothing confident survives. Every run also retries MusicBrainz for any song
 * already in the deck that is still pending a year, not just newly added
 * ones, so rerunning the importer is how a better matcher (or a transient
 * MusicBrainz error) gets a second chance. A stored year is never trusted
 * as-is for a multi-performer credit, even one that already has a year —
 * those are reset to 0 and recomputed every run, since that is exactly the
 * shape of credit a matcher bug can get confidently wrong (see
 * src/songs/musicbrainz.ts). check-songs reports what is still pending
 * afterwards.
 *
 * Run with: npm run import-playlist -- <playlist url or id>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import { playlistIdFromInput, slugify, splitArtistAndTitle } from '../src/songs/import'
import {
  artistNames,
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
import type { Song } from '../src/game/types'

const PAGE_SIZE = 50

/** Past most intros for popular music; imperfect, but far better than 0 (dead air). */
const DEFAULT_START_SECONDS = 30

/**
 * MusicBrainz's own policy: "All users of the API must ensure that each of
 * their client applications never make more than ONE call per second."
 * We wait a little longer than one second to stay safely clear of that.
 */
const MUSICBRAINZ_DELAY_MS = 1100

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

function sleep(ms: number): Promise<void> {
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
 * Thin network call: the matching logic lives in src/songs/musicbrainz.ts.
 * Always asks the release-group search first. The recording search is
 * skipped only when the release group already answered with an Album/EP
 * behind it (combineYearSources trusts that outright) — every other case,
 * including no release-group answer at all, spends the second request:
 * a Single-only release-group year is a claim, not an answer, until the
 * recording search either fails to contradict it or actively confirms an
 * earlier date (see combineYearSources). The sleep before that second
 * request keeps every request this makes at least MUSICBRAINZ_DELAY_MS
 * apart, whether it is the second request for this song or the first
 * request for the next one.
 */
async function lookupYear(artist: string, title: string): Promise<number> {
  const fromReleaseGroups = await lookupYearFromReleaseGroups(artist, title)
  if (fromReleaseGroups.year > 0 && !fromReleaseGroups.singleTypeOnly) {
    return fromReleaseGroups.year
  }

  await sleep(MUSICBRAINZ_DELAY_MS)
  const fromRecordings = await lookupYearFromRecordings(artist, title)
  return combineYearSources(fromReleaseGroups, fromRecordings)
}

interface PlaylistItem {
  snippet?: {
    title?: string
    videoOwnerChannelTitle?: string
    resourceId?: { videoId?: string }
  }
}

async function fetchPlaylistItems(playlistId: string, apiKey: string): Promise<PlaylistItem[]> {
  const items: PlaylistItem[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('playlistId', playlistId)
    url.searchParams.set('maxResults', String(PAGE_SIZE))
    url.searchParams.set('key', apiKey)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`YouTube API ${response.status}: ${await response.text()}`)
    }
    const body = (await response.json()) as { items?: PlaylistItem[]; nextPageToken?: string }
    items.push(...(body.items ?? []))
    pageToken = body.nextPageToken
  } while (pageToken)

  return items
}

function toSong(item: PlaylistItem, takenIds: Set<string>): Song | null {
  const videoId = item.snippet?.resourceId?.videoId
  const rawTitle = item.snippet?.title ?? ''
  if (!videoId) return null
  // YouTube keeps tombstones in playlists for videos that went away.
  if (rawTitle === 'Deleted video' || rawTitle === 'Private video') return null

  const { artist, title } = splitArtistAndTitle(rawTitle, item.snippet?.videoOwnerChannelTitle ?? '')
  // A raw title that is nothing but promotional noise cleans down to nothing.
  if (!title) return null

  let id = slugify(`${artist}-${title}`) || videoId.toLowerCase()
  let suffix = 2
  while (takenIds.has(id)) {
    id = `${slugify(`${artist}-${title}`)}-${suffix}`
    suffix += 1
  }
  takenIds.add(id)

  return { id, videoId, title, artist, year: 0, startSeconds: DEFAULT_START_SECONDS }
}

async function main(): Promise<void> {
  const input = process.argv[2]
  if (!input) throw new Error('Uso: npm run import-playlist -- <url o id de la playlist>')

  const playlistId = playlistIdFromInput(input)
  if (!playlistId) throw new Error(`No se encontró un id de playlist en "${input}"`)

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY es necesaria para leer una playlist')

  const file = path.join(process.cwd(), 'src/songs/songs.json')
  const existing = parseSongs(JSON.parse(readFileSync(file, 'utf8')))
  const knownVideoIds = new Set(existing.map((s) => s.videoId))
  const takenIds = new Set(existing.map((s) => s.id))

  const items = await fetchPlaylistItems(playlistId, apiKey)
  const added: Song[] = []
  for (const item of items) {
    if (knownVideoIds.has(item.snippet?.resourceId?.videoId ?? '')) continue
    const song = toSong(item, takenIds)
    if (!song) continue
    added.push(song)
    // A video repeated later in the same playlist must not be added twice.
    knownVideoIds.add(song.videoId)
  }

  console.log(`${items.length} elementos en la playlist, ${added.length} canciones nuevas.`)

  const merged = [...existing, ...added]

  // Two groups get a MusicBrainz lookup this run:
  //   - every song still pending a year, new or not — a rerun is how a
  //     better matcher (or a transient MusicBrainz hiccup) gets a second
  //     chance without a separate script;
  //   - every multi-performer song that already HAS a year. A stored year
  //     for a collaboration is never trusted as-is: it may predate a matcher
  //     fix, and multi-performer credits are exactly where a wrong-but-
  //     confident year has actually happened (see chooseYear's docstring).
  //     Its year is reset to 0 before the lookup, so if the fixed matcher
  //     still can't confirm it, it lands on 0 — never keeps a stale value.
  const pending = merged.filter((s) => s.year === 0)
  const multiArtistToRecheck = merged.filter((s) => s.year !== 0 && artistNames(s.artist).length > 1)
  const beforeYear = new Map(multiArtistToRecheck.map((s) => [s.id, s.year]))
  for (const song of multiArtistToRecheck) song.year = 0

  const toLookUp = [...pending, ...multiArtistToRecheck]
  console.log(
    `Buscando el año de ${pending.length} canciones sin confirmar y revalidando ` +
      `${multiArtistToRecheck.length} canciones con varios artistas en MusicBrainz ` +
      `(una petición por segundo, esto tarda)...`,
  )

  const needsYearReview: Song[] = []
  let newlyFilled = 0
  let corrected = 0
  let revertedToZero = 0
  let confirmedUnchanged = 0
  for (const song of toLookUp) {
    const year = await lookupYear(song.artist, song.title)
    const previous = beforeYear.get(song.id)
    if (year > 0) {
      song.year = year
      if (previous === undefined) newlyFilled += 1
      else if (previous !== year) corrected += 1
      else confirmedUnchanged += 1
    } else {
      needsYearReview.push(song)
      if (previous !== undefined) revertedToZero += 1
    }
    await sleep(MUSICBRAINZ_DELAY_MS)
  }

  parseSongs(merged) // fail loudly rather than write a broken file
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`)

  console.log(`\n${merged.length} canciones en total.`)
  console.log(
    `Años nuevos: ${newlyFilled}. Revalidación de canciones con varios artistas: ` +
      `${corrected} corregidos, ${confirmedUnchanged} confirmados sin cambios, ` +
      `${revertedToZero} vueltos a 0 por no poder confirmarse con el matcher corregido.`,
  )
  console.log(`${needsYearReview.length} canciones siguen sin año confirmado en total.`)
  if (needsYearReview.length > 0) {
    console.log('Canciones sin año confirmado (revisar year y, si hace falta, startSeconds):')
    for (const song of needsYearReview) console.log(`  ${song.id} — ${song.artist} · ${song.title}`)
  }
  console.log(
    `\nstartSeconds se dejó en ${DEFAULT_START_SECONDS}s para las canciones nuevas. Ajusta a mano las que no arranquen en un punto reconocible.`,
  )
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
