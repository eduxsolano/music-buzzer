import type { Song } from '@/game/types'

/**
 * Which themed decks this song list can honestly offer, and how to cut it
 * down to one.
 *
 * The whole point is the word *honestly*. The user asked for selectors by
 * genre, by artist and by decade; measured against the real deck, each of
 * those collapses to a single usable option or none, because most of this
 * deck is Venezuelan rock MusicBrainz does not catalogue — no year, no genre.
 * Three selectors offering one choice each is worse than no selector.
 *
 * So there is one generic selector, and one rule decides what it shows:
 * **an option appears only if it holds at least `minimum` songs.** An axis
 * with no qualifying option does not appear at all. Nothing here knows which
 * axes happen to qualify today; as the deck's years and artists get
 * hand-curated, the same code starts offering more with no edit. That is why
 * this is a pure function with tests rather than a hand-written list of
 * decks.
 *
 * `minimum` is the caller's to choose and the reasoning behind the app's
 * value lives beside it, on `MIN_DECK_OPTION_SONGS` in `src/game/config.ts`.
 * The short version: it is two games' worth, not one, because an option that
 * holds exactly one game plays all of it every time and can never produce a
 * second game that differs.
 *
 * Pure by the same contract as everything else under `src/game/`: no DOM, no
 * network, no clock, no randomness. Given the same songs it returns the same
 * options in the same order, every time.
 */
export type DeckAxisId = 'playlist' | 'decade' | 'genre' | 'artist'

/** The host's choice. `null` everywhere else in the codebase means the whole deck. */
export interface DeckSelection {
  axis: DeckAxisId
  value: string
}

export interface DeckOption {
  axis: DeckAxisId
  /** The raw value stored on the song: a playlist key, a decade, a genre tag, an artist name. */
  value: string
  /** What the host reads. */
  label: string
  /** How many songs it holds — always at least the minimum, or it would not be here. */
  count: number
}

export interface DeckAxis {
  id: DeckAxisId
  label: string
  /** Never empty: an axis with nothing to offer is dropped rather than shown blank. */
  options: DeckOption[]
}

/** What the host sees when nothing is filtered. The default, and always available. */
export const WHOLE_DECK_LABEL = 'Todo el mazo'

/**
 * Playlist first: it is the only axis whose data does not depend on an
 * outside catalogue, so it is the one guaranteed to have something to say.
 * The rest follow in descending order of how well this deck is covered.
 */
const AXIS_LABELS: Record<DeckAxisId, string> = {
  playlist: 'Listas',
  decade: 'Décadas',
  genre: 'Géneros',
  artist: 'Artistas',
}

const AXIS_ORDER: readonly DeckAxisId[] = ['playlist', 'decade', 'genre', 'artist']

/**
 * Every value a song carries on an axis — a list, because a song genuinely
 * belongs to several playlists, several genres and (for a collaboration)
 * several artists at once. A song with nothing to say on an axis returns
 * nothing and is simply absent from all of that axis's options; a year of 0
 * means "unknown", never the year zero, so it names no decade.
 */
function valuesOf(song: Song, axis: DeckAxisId): readonly string[] {
  switch (axis) {
    case 'playlist':
      return song.playlists ?? []
    case 'decade':
      return song.year === 0 ? [] : [String(Math.floor(song.year / 10) * 10)]
    case 'genre':
      return song.genres ?? []
    case 'artist':
      return song.artists
  }
}

/** Genre tags arrive lowercase from MusicBrainz; nothing else needs touching. */
function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1)
}

/**
 * The host-facing name of a value.
 *
 * Playlist keys are looked up in the registry passed in by the caller — the
 * engine stays free of the song data modules, and a key with no name shows as
 * itself rather than as nothing. Genres, artists and decades are the values
 * themselves: a genre tag or a performer's name is a proper name, not a
 * string to translate.
 */
export function optionLabel(
  axis: DeckAxisId,
  value: string,
  playlistNames: Readonly<Record<string, string>>,
): string {
  switch (axis) {
    case 'playlist':
      return playlistNames[value] ?? value
    case 'decade':
      return `Años ${value}`
    case 'genre':
      return capitalize(value)
    case 'artist':
      return value
  }
}

/**
 * The axes and options this deck can honestly offer.
 *
 * An option holding fewer than `minimum` songs is not offered, however
 * tempting it looks. Options are ordered biggest first so the host's thumb
 * finds the roomiest deck without reading, and ties break alphabetically so
 * the order never moves between renders.
 */
export function offerableDeckAxes(
  songs: readonly Song[],
  minimum: number,
  playlistNames: Readonly<Record<string, string>>,
): DeckAxis[] {
  const axes: DeckAxis[] = []

  for (const axis of AXIS_ORDER) {
    const counts = new Map<string, number>()
    for (const song of songs) {
      // A song listing the same value twice (a duplicate genre tag, a
      // playlist stamped twice) must count once: these are memberships, not
      // occurrences, and the count has to match what `filterSongs` returns.
      for (const value of new Set(valuesOf(song, axis))) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }

    const options: DeckOption[] = []
    for (const [value, count] of counts) {
      if (count < minimum) continue
      options.push({ axis, value, label: optionLabel(axis, value, playlistNames), count })
    }
    options.sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)))

    if (options.length > 0) axes.push({ id: axis, label: AXIS_LABELS[axis], options })
  }

  return axes
}

/** The songs a selection plays. `null` is the whole deck, unchanged and in its own order. */
export function filterSongs(songs: readonly Song[], selection: DeckSelection | null): Song[] {
  if (!selection) return [...songs]
  return songs.filter((song) => valuesOf(song, selection.axis).includes(selection.value))
}

/**
 * Whether a selection is one this deck actually offers.
 *
 * The host's phone is a separate program on a separate device: what arrives
 * over the private channel is a claim, not a fact, and a panel running an
 * older build could ask for an option that no longer holds enough songs. The
 * television checks against its own offer before honouring it, so no message
 * can talk it into dealing a game shorter than a game.
 */
export function isOfferableSelection(
  axes: readonly DeckAxis[],
  selection: DeckSelection | null,
): boolean {
  if (!selection) return true
  return axes.some(
    (axis) =>
      axis.id === selection.axis &&
      axis.options.some((option) => option.value === selection.value),
  )
}

/** What the room is told it is playing. Falls back to the raw value for an unnamed key. */
export function deckLabel(
  selection: DeckSelection | null,
  playlistNames: Readonly<Record<string, string>>,
): string {
  return selection ? optionLabel(selection.axis, selection.value, playlistNames) : WHOLE_DECK_LABEL
}
