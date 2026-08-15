/**
 * Verifies every song in songs.json before a party, not during one.
 *
 * Always checked: the video exists and allows embedding (YouTube's oEmbed
 * endpoint returns 401/404 otherwise).
 * Only when YOUTUBE_API_KEY is set: the video is long enough for the third
 * tier, i.e. duration > startSeconds + 30.
 *
 * year and startSeconds both use 0 as a "needs a human" sentinel. The
 * importer never writes year: 0 unless MusicBrainz could not confirm it, and
 * it never writes startSeconds: 0 at all (it defaults to 30, a real,
 * deliberate value past most intros) — so an explicit 0 in the file always
 * means someone still has to listen and decide. There is no separate flag
 * for "reviewed and kept at 30 on purpose" vs. "still at the default,
 * nobody has listened yet": both look identical in songs.json, and telling
 * them apart would need a field the game itself has no use for, so that
 * distinction is intentionally not tracked.
 *
 * Run with: npm run check-songs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import { isoDurationToSeconds } from '../src/songs/duration'
import type { Song } from '../src/game/types'

const LONGEST_TIER_SECONDS = 30

async function isEmbeddable(videoId: string): Promise<boolean> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
  const response = await fetch(url)
  return response.ok
}

async function durationSeconds(videoId: string, apiKey: string): Promise<number | null> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return null
  const body = (await response.json()) as {
    items?: { contentDetails?: { duration?: string } }[]
  }
  const iso = body.items?.[0]?.contentDetails?.duration
  return iso ? isoDurationToSeconds(iso) : null
}

async function checkSong(song: Song, apiKey: string | undefined): Promise<string[]> {
  const problems: string[] = []

  if (!(await isEmbeddable(song.videoId))) {
    problems.push('video no disponible, privado o con embebido deshabilitado')
  }

  if (apiKey) {
    const seconds = await durationSeconds(song.videoId, apiKey)
    if (seconds === null) {
      problems.push('no se pudo leer la duración desde la YouTube Data API')
    } else if (seconds <= song.startSeconds + LONGEST_TIER_SECONDS) {
      problems.push(
        `demasiado corto: ${seconds}s, necesita más de ${song.startSeconds + LONGEST_TIER_SECONDS}s`,
      )
    }
  }

  if (song.year === 0) {
    problems.push('year sin confirmar (MusicBrainz no encontró una coincidencia segura)')
  }
  if (song.startSeconds === 0) {
    problems.push('startSeconds en 0 — falta elegir el momento en que la canción se reconoce')
  }

  return problems
}

async function main(): Promise<void> {
  const file = path.join(process.cwd(), 'src/songs/songs.json')
  const songs = parseSongs(JSON.parse(readFileSync(file, 'utf8')))

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY no definida — se omiten los chequeos de duración.\n')
  }

  let failures = 0
  for (const song of songs) {
    const problems = await checkSong(song, apiKey)
    if (problems.length === 0) {
      console.log(`ok   ${song.id}`)
    } else {
      failures += 1
      console.error(`FALLA ${song.id}: ${problems.join('; ')}`)
    }
  }

  console.log(`\n${songs.length - failures}/${songs.length} canciones utilizables.`)
  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
