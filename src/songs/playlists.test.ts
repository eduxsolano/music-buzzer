import { describe, expect, test } from 'vitest'
import {
  PLAYLISTS,
  playlistKeyFor,
  playlistKeyFromTitle,
  playlistNames,
  recomputePlaylistKeys,
  withPlaylistKey,
} from '@/songs/playlists'

describe('the playlist registry', () => {
  test('every key and every playlist id appears exactly once', () => {
    expect(new Set(PLAYLISTS.map((p) => p.key)).size).toBe(PLAYLISTS.length)
    expect(new Set(PLAYLISTS.map((p) => p.playlistId)).size).toBe(PLAYLISTS.length)
  })

  test('every entry has a name worth reading on a chip', () => {
    for (const playlist of PLAYLISTS) {
      expect(playlist.name.length).toBeGreaterThan(0)
      // A name that is just the key is a key nobody has named yet.
      expect(playlist.name).not.toBe(playlist.key)
    }
  })

  test('maps a YouTube playlist id to its key, and nothing else to anything', () => {
    expect(playlistKeyFor(PLAYLISTS[0].playlistId)).toBe(PLAYLISTS[0].key)
    expect(playlistKeyFor('PLnot-a-playlist-we-know')).toBeNull()
  })

  test('names are looked up by key', () => {
    expect(playlistNames()[PLAYLISTS[0].key]).toBe(PLAYLISTS[0].name)
  })
})

describe('playlistKeyFromTitle', () => {
  test('slugifies the playlist’s own title', () => {
    expect(playlistKeyFromTitle('Clásicos rock Made in Venezuela', 'PLabc')).toBe(
      'clasicos-rock-made-in-venezuela',
    )
  })

  test('falls back to the playlist id when the title slugifies to nothing', () => {
    // A key must always exist: "imported but from nowhere" is the state the
    // pre-import songs are in, and no import may ever add to it.
    expect(playlistKeyFromTitle('', 'PLabc')).toBe('plabc')
    expect(playlistKeyFromTitle('!!! ¿¿¿', 'PLabc')).toBe('plabc')
  })
})

describe('withPlaylistKey', () => {
  test('adds an origin to a song that had none', () => {
    expect(withPlaylistKey(undefined, 'billboard-2026')).toEqual(['billboard-2026'])
  })

  test('is idempotent, so rerunning the importer produces no diff', () => {
    expect(withPlaylistKey(['billboard-2026'], 'billboard-2026')).toEqual(['billboard-2026'])
  })

  test('keeps both origins for a song two playlists genuinely share', () => {
    expect(withPlaylistKey(['exitos-de-hoy'], 'billboard-2026')).toEqual([
      'billboard-2026',
      'exitos-de-hoy',
    ])
  })

  test('orders registered keys by the registry and unknown ones after, alphabetically', () => {
    expect(withPlaylistKey(['zzz-sin-nombre', 'aaa-sin-nombre'], 'rock-venezolano')).toEqual([
      'rock-venezolano',
      'aaa-sin-nombre',
      'zzz-sin-nombre',
    ])
  })
})

describe('recomputePlaylistKeys', () => {
  test('a song no longer in a playlist loses that origin', () => {
    expect(recomputePlaylistKeys(['billboard-2026', 'exitos-de-hoy'], ['exitos-de-hoy'])).toEqual([
      'exitos-de-hoy',
    ])
  })

  test('an origin the registry cannot speak for is never deleted', () => {
    // Silently dropping what it has no way to check would destroy the origins
    // of a playlist somebody imported but never named.
    expect(recomputePlaylistKeys(['una-lista-sin-nombre'], [])).toEqual(['una-lista-sin-nombre'])
  })

  test('a song in no registered playlist and with nothing else comes back empty', () => {
    expect(recomputePlaylistKeys(undefined, [])).toEqual([])
    expect(recomputePlaylistKeys(['billboard-2026'], [])).toEqual([])
  })
})
