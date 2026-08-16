/**
 * The two YouTube Data API calls every playlist script needs: what a playlist
 * is called, and which videos it holds.
 *
 * Extracted here rather than duplicated because the importer and the origin
 * recovery script must agree exactly on what "this playlist contains video X"
 * means — the recovery is only correct if it reads the same list the importer
 * wrote from. Everything else about the two scripts is different; this is not.
 */
const PAGE_SIZE = 50

export interface PlaylistItem {
  snippet?: {
    title?: string
    videoOwnerChannelTitle?: string
    resourceId?: { videoId?: string }
  }
}

async function getJson(url: URL): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`YouTube API ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

export async function fetchPlaylistItems(playlistId: string, apiKey: string): Promise<PlaylistItem[]> {
  const items: PlaylistItem[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('playlistId', playlistId)
    url.searchParams.set('maxResults', String(PAGE_SIZE))
    url.searchParams.set('key', apiKey)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const body = (await getJson(url)) as { items?: PlaylistItem[]; nextPageToken?: string }
    items.push(...(body.items ?? []))
    pageToken = body.nextPageToken
  } while (pageToken)

  return items
}

/** The playlist's own title on YouTube, or an empty string when it has none. */
export async function fetchPlaylistTitle(playlistId: string, apiKey: string): Promise<string> {
  const url = new URL('https://www.googleapis.com/youtube/v3/playlists')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('id', playlistId)
  url.searchParams.set('key', apiKey)

  const body = (await getJson(url)) as { items?: { snippet?: { title?: string } }[] }
  return body.items?.[0]?.snippet?.title ?? ''
}

/** Every video id in a playlist, tombstones for removed videos included. */
export function videoIdsOf(items: readonly PlaylistItem[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    const videoId = item.snippet?.resourceId?.videoId
    if (videoId) ids.add(videoId)
  }
  return ids
}
