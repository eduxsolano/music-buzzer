/**
 * Stamps every song in songs.json with the playlist(s) it came from.
 *
 * The deck was imported from three YouTube playlists before the importer
 * recorded which; this reads those playlists back and matches on `videoId`,
 * the only field neither the title cleaner nor MusicBrainz can have changed
 * since. It is idempotent and safe to rerun: each song's origins are
 * recomputed from the registry rather than accumulated, so a song dropped
 * from a playlist loses that origin on the next run. Origins whose key is not
 * in `src/songs/playlists.ts` are left alone — see `recomputePlaylistKeys`.
 *
 * Songs matching no registered playlist keep no `playlists` field at all.
 * That is the honest answer for the handful that predate the imports: they
 * came from nowhere, so they belong to no themed deck and only ever play as
 * part of the whole one.
 *
 * Nothing else in songs.json is touched — years in particular, verified or
 * not, are read and written back exactly as found.
 *
 * Run with: npm run recover-playlists
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import { PLAYLISTS, recomputePlaylistKeys } from '../src/songs/playlists'
import { fetchPlaylistItems, videoIdsOf } from './youtube-playlist'

async function main(): Promise<void> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY es necesaria para leer las playlists')

  const file = path.join(process.cwd(), 'src/songs/songs.json')
  const songs = parseSongs(JSON.parse(readFileSync(file, 'utf8')))

  const videosByKey = new Map<string, Set<string>>()
  for (const playlist of PLAYLISTS) {
    const items = await fetchPlaylistItems(playlist.playlistId, apiKey)
    const videoIds = videoIdsOf(items)
    videosByKey.set(playlist.key, videoIds)
    console.log(`${playlist.name}: ${items.length} elementos, ${videoIds.size} videos distintos.`)
  }

  const claimed = new Map<string, number>(PLAYLISTS.map((playlist) => [playlist.key, 0]))
  let shared = 0
  const orphans: typeof songs = []

  for (const song of songs) {
    const containing = PLAYLISTS.filter(
      (playlist) => videosByKey.get(playlist.key)?.has(song.videoId),
    ).map((playlist) => playlist.key)

    const keys = recomputePlaylistKeys(song.playlists, containing)
    if (keys.length === 0) {
      delete song.playlists
      orphans.push(song)
    } else {
      song.playlists = keys
      if (keys.length > 1) shared += 1
    }
    for (const key of containing) claimed.set(key, (claimed.get(key) ?? 0) + 1)
  }

  // Reparsed rather than written straight back: parseSongs rebuilds every
  // entry in the schema's field order, so a `playlists` assigned onto an
  // existing object lands where the schema says it belongs instead of after
  // whatever field happened to be last. It also fails loudly rather than
  // writing a broken file.
  writeFileSync(file, `${JSON.stringify(parseSongs(songs), null, 2)}\n`)

  console.log(`\n${songs.length} canciones en total.`)
  for (const playlist of PLAYLISTS) {
    console.log(`  ${playlist.name} (${playlist.key}): ${claimed.get(playlist.key)} canciones.`)
  }
  console.log(`${shared} canciones aparecen en más de una playlist.`)
  console.log(`${orphans.length} canciones sin playlist de origen (anteriores a las importaciones):`)
  for (const song of orphans) console.log(`  ${song.id} — ${song.artist} · ${song.title}`)
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
