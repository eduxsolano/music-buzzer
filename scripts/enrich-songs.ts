/**
 * Pins every song in the deck to a MusicBrainz release group and stores what
 * hangs off it: the canonical title, the artist credit as both a display
 * string and a list, the genres, and the front cover downloaded into
 * `public/covers` so the reveal never waits on a third party mid-party.
 *
 * A song MusicBrainz cannot confidently identify is left exactly as it was
 * found — rough YouTube-derived title, rough artist, one-entry artist list, no
 * id, no genres, no cover — and stays perfectly playable. The asymmetry is the
 * one that governs years in this deck: a rough name that looks rough is
 * harmless, a confident wrong one is not. See chooseIdentity in
 * src/songs/enrich.ts for exactly what "confidently" means.
 *
 * **This script never writes a year.** Not for a verified song, not for any
 * other. Years are the province of import-playlist.ts and reaudit-years.ts,
 * which route every change through resolveYear and the verified-years list;
 * a second writer of that field is exactly the out-of-band process
 * src/songs/verified-years.ts exists because of. Every year is snapshotted
 * before the run and asserted unchanged before anything is written, so this
 * promise is enforced rather than merely stated.
 *
 * Reruns are cheap and safe: a song that already carries a release group id is
 * skipped, and a cover already on disk is not downloaded again, so an
 * interrupted run resumes where it stopped. Pass `--all` to re-identify every
 * song from scratch (after a matcher change, say), or `--covers` to skip
 * identification altogether and only re-ask the archive about the identified
 * songs that still have no image.
 *
 * One thing this script deliberately cannot do: undo a canonical rename. Once
 * a song's title and artist have been replaced, the YouTube-derived originals
 * are gone from the deck — they are provenance, and provenance does not belong
 * in the shape the engine consumes. So when the matcher is made *stricter* and
 * a song that used to match no longer should, the way to apply that is to
 * restore those entries from version control (which is where the originals
 * live) and rerun. Nothing here silently keeps a name a tightened matcher would
 * now refuse to produce.
 *
 * This makes one MusicBrainz request per song, plus a second (genres) and a
 * Cover Art Archive request for each song it identifies, all at one request per
 * second. Measured on this deck: about ten minutes when almost everything is
 * already identified, and over an hour for a cold run of 376 songs. It is not
 * something to kick off five minutes before a party.
 *
 * Run with: npm run enrich-songs [-- --all]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import { coverPath } from '../src/songs/enrich'
import { lookupGenres, lookupIdentity, sleep, MUSICBRAINZ_DELAY_MS } from './musicbrainz-client'
import { fetchCover, COVER_ART_DELAY_MS } from './cover-art-client'
import type { Song } from '../src/game/types'

/** How often the partially-enriched deck is flushed, so an interrupted run is not a lost run. */
const SAVE_EVERY = 20

interface Totals {
  identified: number
  renamed: number
  recredited: number
  withGenres: number
  withCover: number
  noCoverInArchive: number
  coverFailed: number
  unmatched: number
}

/** The deck is written in one field order, so a rerun produces no incidental diff. */
function serialize(songs: Song[]): string {
  const ordered = songs.map((song) => ({
    id: song.id,
    videoId: song.videoId,
    title: song.title,
    artist: song.artist,
    artists: song.artists,
    year: song.year,
    startSeconds: song.startSeconds,
    ...(song.releaseGroupId ? { releaseGroupId: song.releaseGroupId } : {}),
    ...(song.genres && song.genres.length > 0 ? { genres: song.genres } : {}),
    ...(song.cover ? { cover: song.cover } : {}),
  }))
  return `${JSON.stringify(ordered, null, 2)}\n`
}

/**
 * The promise in this file's header, enforced. Any difference here means a
 * code path started writing years behind the back of resolveYear and the
 * verified-years list, and the run is aborted rather than saved.
 */
function assertYearsUntouched(songs: Song[], before: Map<string, number>): void {
  for (const song of songs) {
    const was = before.get(song.id)
    if (was !== undefined && was !== song.year) {
      throw new Error(
        `enrich-songs tocó el año de "${song.id}" (${was} → ${song.year}). ` +
          'Los años solo se escriben desde reaudit-years/import-playlist, vía resolveYear.',
      )
    }
  }
}

/**
 * Downloads a song's cover if it isn't already on disk, and points the song at
 * it. Returns false only when the archive failed to answer — the caller gives
 * those one more go at the end of the run, since "no art for this release
 * group" (a 404) and "the Internet Archive hiccuped" are indistinguishable
 * once the run is over and only the second one is worth retrying.
 */
async function storeCover(
  song: Song,
  releaseGroupId: string,
  coversDir: string,
  totals: Totals,
  /**
   * False when this song was just re-identified as a *different* release
   * group, in which case whatever is on disk is the old record's sleeve and
   * has to be replaced rather than reused.
   */
  mayReuseDisk = true,
): Promise<boolean> {
  const file = path.join(coversDir, `${song.id}.jpg`)
  if (mayReuseDisk && existsSync(file) && statSync(file).size > 0) {
    song.cover = coverPath(song.id)
    totals.withCover += 1
    return true
  }

  const cover = await fetchCover(releaseGroupId)
  await sleep(COVER_ART_DELAY_MS)

  delete song.cover
  if (cover.kind === 'image') {
    writeFileSync(file, cover.bytes)
    song.cover = coverPath(song.id)
    totals.withCover += 1
    return true
  }
  if (cover.kind === 'none') {
    totals.noCoverInArchive += 1
    return true
  }
  console.warn(`aviso: portada de "${song.id}" falló: ${cover.reason}`)
  return false
}

async function main(): Promise<void> {
  const redoAll = process.argv.includes('--all')
  /** Skip identification entirely and only chase the covers that are still missing. */
  const coversOnly = process.argv.includes('--covers')

  const songsFile = path.join(process.cwd(), 'src/songs/songs.json')
  const coversDir = path.join(process.cwd(), 'public/covers')
  const songs = parseSongs(JSON.parse(readFileSync(songsFile, 'utf8')))
  const yearsBefore = new Map(songs.map((song) => [song.id, song.year]))
  mkdirSync(coversDir, { recursive: true })

  const pending = coversOnly ? [] : redoAll ? songs : songs.filter((song) => !song.releaseGroupId)
  console.log(
    `${songs.length} canciones en el mazo, ${pending.length} por identificar en MusicBrainz ` +
      '(una petición por segundo, esto tarda varios minutos)...',
  )

  const totals: Totals = {
    identified: 0,
    renamed: 0,
    recredited: 0,
    withGenres: 0,
    withCover: 0,
    noCoverInArchive: 0,
    coverFailed: 0,
    unmatched: 0,
  }
  const unmatched: Song[] = []
  const coverRetries: [Song, string][] = []

  const save = (): void => {
    assertYearsUntouched(songs, yearsBefore)
    parseSongs(songs) // fail loudly rather than write a broken file
    writeFileSync(songsFile, serialize(songs))
  }

  for (const [index, song] of pending.entries()) {
    const identity = await lookupIdentity(song.artist, song.title)
    await sleep(MUSICBRAINZ_DELAY_MS)

    // Nothing is cleared here, deliberately — not even on `--all`. A song that
    // matched on an earlier run and does not today has met the bar once, and
    // "MusicBrainz did not answer confidently this minute" is the same thing
    // whether the cause is an edit on their side or a request that timed out.
    // Wiping good data on that signal would make every rerun a gamble.
    if (!identity) {
      totals.unmatched += 1
      unmatched.push(song)
      if ((index + 1) % SAVE_EVERY === 0) save()
      continue
    }

    totals.identified += 1
    if (identity.title !== song.title) totals.renamed += 1
    if (identity.artist !== song.artist) totals.recredited += 1
    const sameEntityAsBefore = song.releaseGroupId === identity.releaseGroupId
    song.releaseGroupId = identity.releaseGroupId
    song.title = identity.title
    song.artist = identity.artist
    song.artists = identity.artists

    const genres = await lookupGenres(identity.releaseGroupId)
    await sleep(MUSICBRAINZ_DELAY_MS)
    if (genres.length > 0) {
      song.genres = genres
      totals.withGenres += 1
    } else {
      delete song.genres
    }

    if (!(await storeCover(song, identity.releaseGroupId, coversDir, totals, sameEntityAsBefore))) {
      coverRetries.push([song, identity.releaseGroupId])
    }

    if ((index + 1) % SAVE_EVERY === 0) {
      save()
      console.log(`  ${index + 1}/${pending.length}...`)
    }
  }

  // A cover the archive refused twice in one run is worth asking about again
  // on another day, but nothing in the deck records *why* a song has no cover
  // — "the archive has none" and "the archive was down" leave the same
  // absence. So this is its own pass, over the handful of songs that carry an
  // id and no image: cheap (one request each), and it never re-asks about the
  // hundreds of songs that were never identified in the first place.
  if (coversOnly) {
    const missing = songs.filter((song) => song.releaseGroupId && !song.cover)
    console.log(`${missing.length} canción(es) identificada(s) sin portada; reintentando...`)
    for (const song of missing) {
      if (!(await storeCover(song, song.releaseGroupId as string, coversDir, totals))) {
        totals.coverFailed += 1
      }
    }
  }

  if (coverRetries.length > 0) {
    console.log(`\nReintentando ${coverRetries.length} portada(s) que fallaron...`)
    for (const [song, releaseGroupId] of coverRetries) {
      if (!(await storeCover(song, releaseGroupId, coversDir, totals))) totals.coverFailed += 1
    }
  }

  save()

  const deckWith = (predicate: (song: Song) => boolean): number => songs.filter(predicate).length
  console.log(`\nDe las ${pending.length} consultadas: ${totals.identified} identificadas, ${totals.unmatched} sin coincidencia segura.`)
  console.log(
    `  ${totals.renamed} títulos canónicos distintos del de YouTube, ` +
      `${totals.recredited} créditos de artista distintos.`,
  )
  console.log(
    `  Portadas: ${totals.withCover} descargadas, ${totals.noCoverInArchive} sin arte en el Cover Art Archive, ` +
      `${totals.coverFailed} con error.`,
  )
  console.log(`\nMazo completo (${songs.length} canciones):`)
  console.log(`  con releaseGroupId (y por tanto nombre y lista de artistas canónicos): ${deckWith((s) => Boolean(s.releaseGroupId))}`)
  console.log(`  con género: ${deckWith((s) => Boolean(s.genres?.length))}`)
  console.log(`  con portada: ${deckWith((s) => Boolean(s.cover))}`)

  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} sin identificar (se quedan con lo que tenían):`)
    for (const song of unmatched) console.log(`  ${song.id} — ${song.artist} · ${song.title}`)
  }
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
