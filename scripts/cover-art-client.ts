/**
 * Thin Cover Art Archive client. Separate file from musicbrainz-client.ts
 * because it is a separate service with its own rules, and pretending
 * otherwise is how one service's politeness budget gets spent on the other.
 *
 * The Cover Art Archive documents no rate limit ("There are currently no rate
 * limiting rules in place at coverartarchive.org") and no User-Agent policy,
 * but it is run by the same project as MusicBrainz and served out of the
 * Internet Archive, so this client identifies itself the same way and paces
 * itself anyway — see COVER_ART_DELAY_MS.
 *
 * All decisions live in src/songs/enrich.ts; this file only knows how to ask
 * for one image and hand back its bytes.
 */

/**
 * Politeness, not obedience: nothing on their side asks for this. In practice
 * the caller's MusicBrainz pacing already spaces these out by seconds, and
 * this only bounds the case where a long run of songs is served from cache.
 */
export const COVER_ART_DELAY_MS = 300

/** Same identification MusicBrainz requires, on the theory that it is never worse to say who you are. */
const COVER_ART_USER_AGENT = 'HitsterBuzzer/0.1 (eduardoasolanog@gmail.com)'

/**
 * 250px on the long edge. The reveal card shows the sleeve beside a title set
 * in tens of points, not as a wallpaper, and these are copyrighted label
 * artwork going into a public git repository — the smallest thumbnail that
 * still reads as the record is the right size on both counts. The next size
 * up (500) is roughly four times the bytes for a card nobody stands closer
 * than a sofa away from.
 */
const THUMBNAIL_SIZE = 250

const MAX_ATTEMPTS = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** JPEG's magic number, so a redirect that lands on an error page is never written to disk as an image. */
function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

export type CoverResult =
  | { kind: 'image'; bytes: Uint8Array }
  /** The archive has no front image for this release group. Not an error. */
  | { kind: 'none' }
  /** The archive answered with something that is not a JPEG thumbnail, or not at all. */
  | { kind: 'failed'; reason: string }

/**
 * Fetches the front cover thumbnail of one release group.
 *
 * A 404 is the archive's normal way of saying "no art for this one" and is
 * reported as `none`, not as a failure — most release groups genuinely have
 * none, and treating that as an error would bury the ones that really did go
 * wrong.
 */
export async function fetchCover(releaseGroupId: string): Promise<CoverResult> {
  const url = `https://coverartarchive.org/release-group/${releaseGroupId}/front-${THUMBNAIL_SIZE}`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response
    try {
      response = await fetch(url, { headers: { 'User-Agent': COVER_ART_USER_AGENT } })
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { kind: 'failed', reason: String(error) }
      await sleep(COVER_ART_DELAY_MS * attempt * 4)
      continue
    }

    if (response.status === 404) return { kind: 'none' }

    if (!response.ok) {
      if (attempt === MAX_ATTEMPTS) return { kind: 'failed', reason: `HTTP ${response.status}` }
      await sleep(COVER_ART_DELAY_MS * attempt * 4)
      continue
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (isJpeg(bytes)) return { kind: 'image', bytes }
    // A 200 that is not a JPEG means the redirect landed somewhere other than
    // the image — an Internet Archive error page, usually. Retryable, because
    // it is a fact about that moment and not about this release group.
    if (attempt === MAX_ATTEMPTS) return { kind: 'failed', reason: 'la respuesta no es un JPEG' }
    await sleep(COVER_ART_DELAY_MS * attempt * 4)
  }

  return { kind: 'failed', reason: 'sin intentos restantes' }
}
