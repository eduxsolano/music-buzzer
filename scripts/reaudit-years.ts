/**
 * The full deck re-audit: re-checks every song's year against a fresh
 * MusicBrainz lookup, not just the ones still pending (see
 * import-playlist.ts for the incremental version, which only touches songs
 * at year: 0 or with a multi-performer credit).
 *
 * This is the process that clobbered hand-verified years twice before this
 * script existed. It always ran out of band, from whoever happened to be
 * doing the audit, with no record in the repository of which ids to leave
 * alone — that memory lived in a person, not in git, and it failed. This
 * script always consults src/songs/verified-years.json before touching a
 * song: a song on that list keeps its year no matter what a fresh lookup
 * says, and a lookup that disagrees with a verified value is reported here
 * for a human to look at, never applied (see resolveYear in
 * src/songs/verified-years.ts and auditYears in src/songs/reaudit.ts for
 * exactly how).
 *
 * This queries MusicBrainz for every song in the deck, at one request per
 * second — for the full deck that is several minutes, not seconds.
 *
 * Run with: npm run reaudit-years
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import { parseVerifiedYears, unknownVerifiedIds } from '../src/songs/verified-years'
import { auditYears } from '../src/songs/reaudit'
import { lookupYear, sleep, MUSICBRAINZ_DELAY_MS } from './musicbrainz-client'

const PROGRESS_EVERY = 25

async function main(): Promise<void> {
  const songsFile = path.join(process.cwd(), 'src/songs/songs.json')
  const verifiedFile = path.join(process.cwd(), 'src/songs/verified-years.json')

  const songs = parseSongs(JSON.parse(readFileSync(songsFile, 'utf8')))
  const verified = parseVerifiedYears(JSON.parse(readFileSync(verifiedFile, 'utf8')))

  const staleIds = unknownVerifiedIds(verified, songs)
  if (staleIds.length > 0) {
    console.warn(
      `aviso: verified-years.json menciona ${staleIds.length} id(s) que ya no existen en el mazo: ` +
        `${staleIds.join(', ')}`,
    )
  }

  console.log(
    `Reauditando ${songs.length} canciones en MusicBrainz (una petición por segundo, esto tarda varios minutos)...`,
  )

  const result = await auditYears(
    songs,
    verified,
    async (artist, title) => {
      const year = await lookupYear(artist, title)
      await sleep(MUSICBRAINZ_DELAY_MS)
      return year
    },
    (_song, index, total) => {
      const done = index + 1
      if (done % PROGRESS_EVERY === 0 || done === total) console.log(`  ${done}/${total}...`)
    },
  )

  parseSongs(songs) // fail loudly rather than write a broken file
  writeFileSync(songsFile, `${JSON.stringify(songs, null, 2)}\n`)

  const withYear = songs.filter((s) => s.year > 0).length
  console.log(`\n${songs.length} canciones en total, ${withYear} con año confirmado.`)
  console.log(
    `Nuevos: ${result.newlyFilled}. Corregidos: ${result.corrected}. ` +
      `Confirmados sin cambios: ${result.confirmedUnchanged}. Vueltos a 0: ${result.revertedToZero}.`,
  )
  if (result.restored > 0) {
    console.log(
      `${result.restored} año(s) protegido(s) en verified-years.json tenían otro valor en songs.json y se restauraron.`,
    )
  }

  if (result.disagreements.length > 0) {
    console.log(
      `\n${result.disagreements.length} canción(es) protegida(s) no coinciden con MusicBrainz — ` +
        `se mantiene el valor verificado, revisar si el motivo sigue vigente:`,
    )
    for (const entry of result.disagreements) {
      console.log(`  ${entry.id}: verificado=${entry.after}, MusicBrainz sugiere=${entry.lookupYear}`)
    }
  } else {
    console.log('\nNinguna canción protegida entra en conflicto con MusicBrainz.')
  }

  console.log('\nEjecuta `npm run check-songs` para ver el estado completo del mazo.')
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
