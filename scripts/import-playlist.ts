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
 * A song listed in src/songs/verified-years.json is never touched by any of
 * the above: its year is a human's hand-verified fact, not a matcher guess,
 * and it is excluded from both the pending and multi-performer lookups. If
 * its stored value has drifted from the verified one (e.g. something wrote
 * over it outside this script), it is restored and reported instead of
 * silently left however it was found.
 *
 * Run with: npm run import-playlist -- <playlist url or id>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import { playlistIdFromInput, slugify, splitArtistAndTitle } from '../src/songs/import'
import { artistNames } from '../src/songs/musicbrainz'
import { parseVerifiedYears, verifiedYearsById } from '../src/songs/verified-years'
import { lookupYear, sleep, MUSICBRAINZ_DELAY_MS } from './musicbrainz-client'
import type { Song } from '../src/game/types'

const PAGE_SIZE = 50

/** Past most intros for popular music; imperfect, but far better than 0 (dead air). */
const DEFAULT_START_SECONDS = 30

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

  // One entry, the whole credit: a YouTube-derived string split on punctuation
  // would invent artists that do not exist ("Earth, Wind & Fire"). Only a
  // MusicBrainz match may fill a real list — see scripts/enrich-songs.ts.
  return { id, videoId, title, artist, artists: [artist], year: 0, startSeconds: DEFAULT_START_SECONDS }
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

  const verifiedFile = path.join(process.cwd(), 'src/songs/verified-years.json')
  const verifiedById = verifiedYearsById(parseVerifiedYears(JSON.parse(readFileSync(verifiedFile, 'utf8'))))

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

  // A song on the verified-years list is read-only for this script: its
  // year is a human's hand-verified fact, never a matcher guess, so it is
  // kept out of both groups below entirely. If its stored value has
  // drifted from the verified one (an out-of-band process wrote over it —
  // exactly the incident src/songs/verified-years.ts exists to stop), it
  // is restored here and reported, not silently left wrong.
  let restoredFromVerified = 0
  for (const song of merged) {
    const verified = verifiedById.get(song.id)
    if (verified && song.year !== verified.year) {
      console.warn(
        `aviso: "${song.id}" tenía year=${song.year} pero está protegido en verified-years.json ` +
          `con ${verified.year} (${verified.note}); restaurado.`,
      )
      song.year = verified.year
      restoredFromVerified += 1
    }
  }

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
  const pending = merged.filter((s) => s.year === 0 && !verifiedById.has(s.id))
  const multiArtistToRecheck = merged.filter(
    (s) => s.year !== 0 && artistNames(s.artist).length > 1 && !verifiedById.has(s.id),
  )
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
  if (restoredFromVerified > 0) {
    console.log(`${restoredFromVerified} año(s) protegido(s) en verified-years.json se restauraron.`)
  }
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
