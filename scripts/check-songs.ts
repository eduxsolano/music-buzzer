/**
 * Verifies every song in songs.json before a party, not during one.
 *
 * Always checked: the video exists and allows embedding (YouTube's oEmbed
 * endpoint returns 401/404 otherwise).
 * Only when YOUTUBE_API_KEY is set: the video is long enough for the third
 * tier, i.e. duration > startSeconds + 30.
 *
 * Run with: npm run check-songs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import type { Song } from '../src/game/types'

const LONGEST_TIER_SECONDS = 30

async function isEmbeddable(videoId: string): Promise<boolean> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
  const response = await fetch(url)
  return response.ok
}

/** ISO-8601 duration as returned by the YouTube Data API, e.g. "PT4M33S". */
function isoDurationToSeconds(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!match) return 0
  const [, h, m, s] = match
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
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
    problems.push('video missing, private, or embedding disabled')
  }

  if (apiKey) {
    const seconds = await durationSeconds(song.videoId, apiKey)
    if (seconds === null) {
      problems.push('could not read duration from the YouTube Data API')
    } else if (seconds <= song.startSeconds + LONGEST_TIER_SECONDS) {
      problems.push(
        `too short: ${seconds}s, needs more than ${song.startSeconds + LONGEST_TIER_SECONDS}s`,
      )
    }
  }

  return problems
}

async function main(): Promise<void> {
  const file = path.join(process.cwd(), 'src/songs/songs.json')
  const songs = parseSongs(JSON.parse(readFileSync(file, 'utf8')))

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY not set — skipping duration checks.\n')
  }

  let failures = 0
  for (const song of songs) {
    const problems = await checkSong(song, apiKey)
    if (problems.length === 0) {
      console.log(`ok   ${song.id}`)
    } else {
      failures += 1
      console.error(`FAIL ${song.id}: ${problems.join('; ')}`)
    }
  }

  console.log(`\n${songs.length - failures}/${songs.length} songs usable.`)
  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
