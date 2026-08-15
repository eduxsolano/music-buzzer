/**
 * Turns a YouTube playlist into songs.json entries.
 *
 * Fills videoId, title and a guessed artist. startSeconds is set to a fixed
 * default (past most intros) so the deck is playable immediately; year is
 * looked up on MusicBrainz and left at 0 — pending review — whenever the
 * match is not confident. Every run also retries MusicBrainz for any song
 * already in the deck that is still pending a year, not just newly added
 * ones, so rerunning the importer is how a better matcher (or a transient
 * MusicBrainz error) gets a second chance. check-songs reports what is
 * still pending afterwards.
 *
 * Run with: npm run import-playlist -- <playlist url or id>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import { playlistIdFromInput, slugify, splitArtistAndTitle } from '../src/songs/import'
import { buildRecordingQuery, chooseYear, toCandidate, type MusicBrainzRecording } from '../src/songs/musicbrainz'
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

/** Thin network call: the matching logic lives in src/songs/musicbrainz.ts. */
async function lookupYear(artist: string, title: string): Promise<number> {
  const url = new URL('https://musicbrainz.org/ws/2/recording/')
  url.searchParams.set('query', buildRecordingQuery(artist, title))
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', '5')

  for (let attempt = 1; attempt <= MUSICBRAINZ_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': MUSICBRAINZ_USER_AGENT } })
    if (response.ok) {
      const body = (await response.json()) as { recordings?: MusicBrainzRecording[] }
      const candidates = (body.recordings ?? []).map(toCandidate)
      return chooseYear(candidates, artist, title)
    }
    const canRetry = response.status === 503 && attempt < MUSICBRAINZ_MAX_ATTEMPTS
    if (!canRetry) return 0
    await sleep(MUSICBRAINZ_DELAY_MS * attempt)
  }
  return 0
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
  // Also retries any song already in the deck that was left pending by a
  // previous run — a rerun is how a better matcher (or a transient
  // MusicBrainz hiccup) gets a second chance without a separate script.
  const pendingYear = merged.filter((s) => s.year === 0)
  console.log(
    `Buscando el año de ${pendingYear.length} canciones sin confirmar en MusicBrainz ` +
      `(una petición por segundo, esto tarda)...`,
  )

  const needsYearReview: Song[] = []
  let yearsFilled = 0
  for (const song of pendingYear) {
    const year = await lookupYear(song.artist, song.title)
    if (year > 0) {
      song.year = year
      yearsFilled += 1
    } else {
      needsYearReview.push(song)
    }
    await sleep(MUSICBRAINZ_DELAY_MS)
  }

  parseSongs(merged) // fail loudly rather than write a broken file
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`)

  console.log(`\n${merged.length} canciones en total.`)
  console.log(
    `Años: ${yearsFilled} encontrados automáticamente en esta pasada, ` +
      `${needsYearReview.length} siguen requiriendo revisión manual.`,
  )
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
