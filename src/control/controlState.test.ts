import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import { toPublicState } from '@/game/publicState'
import { toControlState, type ControlDeck } from '@/control/controlState'
import { WHOLE_DECK_LABEL } from '@/game/deckFilters'
import type { GameEvent, GameState, Song } from '@/game/types'

/** The default the host never had to choose: the whole deck, nothing filtered. */
const deck: ControlDeck = {
  axes: [
    {
      id: 'playlist',
      label: 'Listas',
      options: [
        { axis: 'playlist', value: 'rock-venezolano', label: 'Rock venezolano', count: 156 },
      ],
    },
  ],
  selection: null,
  label: WHOLE_DECK_LABEL,
  size: 328,
  total: 328,
}

const song: Song = {
  id: 's1',
  videoId: 'hTWKbfoikeg',
  title: 'Smells Like Teen Spirit',
  artist: 'Nirvana',
  artists: ['Nirvana'],
  year: 1991,
  startSeconds: 42,
  releaseGroupId: 'd42503ec-54fd-3ac7-83ac-a5e37425509c',
  genres: ['grunge'],
  cover: '/covers/smells-like-teen-spirit.jpg',
}

const start: GameEvent[] = [
  { type: 'JOIN', playerId: 'p1', name: 'Ana' },
  { type: 'JOIN', playerId: 'p2', name: 'Beto' },
  { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 },
]

function play(events: GameEvent[]): GameState {
  return events.reduce(reduce, initialState())
}

describe('what the host phone is told', () => {
  test('the answer, which is the whole reason the panel exists', () => {
    const control = toControlState(play(start), song, 'KZTR', false, deck)
    expect(control.song).toEqual({ title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991 })
    expect(control.room).toBe('KZTR')
  })

  test('who is being judged and what their answer is worth', () => {
    const state = play([...start, { type: 'LAUNCH_TIER' }, { type: 'BUZZ', playerId: 'p2' }])
    const control = toControlState(state, song, 'KZTR', false, deck)

    expect(control.buzzedName).toBe('Beto')
    expect(control.buzzedPoints).toBe(5)
    expect(control.pointsAtStake).toBe(5)
  })

  // Regression: `pointsAtStake` used to be computed twice — once here, once
  // in `toPublicState` — and the two drifted apart the moment the engine
  // learned that the round's opening wait (before the host has launched tier
  // 1 even once) cannot score. This asserts the panel and the television are
  // told the same number from the same state, not just that each looks right
  // in isolation.
  test('pointsAtStake agrees with what the television is told, including during the opening wait', () => {
    const dealt = play(start)
    const control = toControlState(dealt, song, 'KZTR', false, deck)
    expect(control.phase).toBe('waiting')
    expect(control.pointsAtStake).toBeNull()
    expect(control.pointsAtStake).toBe(toPublicState(dealt).pointsAtStake)

    const launched = play([...start, { type: 'LAUNCH_TIER' }, { type: 'TICK', deltaMs: 5_000 }])
    const controlAfter = toControlState(launched, song, 'KZTR', false, deck)
    expect(controlAfter.phase).toBe('waiting')
    expect(controlAfter.pointsAtStake).toBe(5)
    expect(controlAfter.pointsAtStake).toBe(toPublicState(launched).pointsAtStake)
  })

  test('the pause reports the tier the launch button will sound and where it resumes', () => {
    const state = play([
      ...start,
      { type: 'LAUNCH_TIER' },
      { type: 'TICK', deltaMs: 2_400 },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: false },
    ])
    const control = toControlState(state, song, 'KZTR', true, deck)

    expect(control.phase).toBe('waiting')
    expect(control.launchTier).toBe(1)
    expect(control.launchResumesAtMs).toBe(2_400)
    expect(control.pointsAtStake).toBe(5)
    expect(control.canUndo).toBe(true)
  })

  test('who is out of this song, so the host is not told a name that cannot press', () => {
    const state = play([
      ...start,
      { type: 'LAUNCH_TIER' },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: false },
    ])
    const control = toControlState(state, song, 'KZTR', true, deck)

    expect(control.players).toEqual([
      { id: 'p1', name: 'Ana', score: -1, out: true },
      { id: 'p2', name: 'Beto', score: 0, out: false },
    ])
  })

  test('names the winner of the round rather than an id', () => {
    const state = play([
      ...start,
      { type: 'LAUNCH_TIER' },
      { type: 'BUZZ', playerId: 'p2' },
      { type: 'JUDGE', correct: true },
    ])
    const control = toControlState(state, song, 'KZTR', true, deck)

    expect(control.outcome).toBe('correct')
    expect(control.winnerName).toBe('Beto')
  })

  test('no song dealt means no card', () => {
    expect(toControlState(initialState(), null, 'KZTR', false, deck).song).toBeNull()
  })

  test('nothing in it changes on a tick, so the private channel stays quiet too', () => {
    const running = play([...start, { type: 'LAUNCH_TIER' }])
    const later = reduce(reduce(running, { type: 'TICK', deltaMs: 50 }), { type: 'TICK', deltaMs: 50 })

    expect(toControlState(later, song, 'KZTR', false, deck)).toEqual(
      toControlState(running, song, 'KZTR', false, deck),
    )
  })
})

describe('the anti-cheat boundary', () => {
  // The one property the whole design rests on. The two projections are built
  // from the same state; only one of them may ever name the song, and the
  // other one is what every player's browser receives.
  test('the players are never told anything identifying the song', () => {
    const phases: GameState[] = [
      play(start),
      play([...start, { type: 'LAUNCH_TIER' }]),
      play([...start, { type: 'LAUNCH_TIER' }, { type: 'BUZZ', playerId: 'p1' }]),
      play([
        ...start,
        { type: 'LAUNCH_TIER' },
        { type: 'BUZZ', playerId: 'p1' },
        { type: 'JUDGE', correct: true },
      ]),
    ]

    for (const state of phases) {
      const published = JSON.stringify(toPublicState(state))
      expect(published).not.toContain(song.title)
      expect(published).not.toContain(song.artist)
      expect(published).not.toContain(song.videoId)
      expect(published).not.toContain(String(song.year))
      expect(published).not.toContain('s1')
      // A sleeve names a song faster than a word does, so it is held to the
      // same line as the title — and so are the catalogue facts beside it.
      expect(published).not.toContain(song.cover as string)
      expect(published).not.toContain('covers')
      expect(published).not.toContain(song.releaseGroupId as string)
      expect(published).not.toContain('grunge')
    }
  })

  test('the host phone is told exactly what the players are not', () => {
    const state = play([...start, { type: 'LAUNCH_TIER' }])
    expect(JSON.stringify(toControlState(state, song, 'KZTR', false, deck))).toContain(song.title)
  })

  /**
   * A chosen deck is a hint, and a big one: "todo esto es de los 2020"
   * narrows twenty guesses at once, and "Caramelos de Cianuro" narrows them
   * to nothing. It is deliberately a fact of the ROOM — the television names
   * it, the host announces it — and never a fact on the wire the players'
   * browsers can read. The room hearing it is a choice; a phone learning it
   * from a message is a leak, and the two are not the same thing.
   */
  test('the deck the host chose never reaches the players', () => {
    const filtered = {
      ...deck,
      selection: { axis: 'decade' as const, value: '2020' },
      label: 'Años 2020',
      size: 105,
    }
    const state = play([...start, { type: 'LAUNCH_TIER' }])

    const published = JSON.stringify(toPublicState(state))
    expect(published).not.toContain('2020')
    expect(published).not.toContain('Años')
    expect(published).not.toContain('decade')
    expect(published).not.toContain('deck')
    expect(published).not.toContain('rock-venezolano')

    // And the host's own phone is told all of it, on the private channel.
    expect(JSON.stringify(toControlState(state, song, 'KZTR', false, filtered))).toContain('Años 2020')
  })

  test('not even the host phone carries the sleeve — it belongs to the television alone', () => {
    // Not a secrecy rule (the panel is already told the answer) but a scope
    // one: the cover exists to be seen from the sofa, the panel is held at
    // arm's length, and the private channel stays as small as it started.
    const state = play([...start, { type: 'LAUNCH_TIER' }])
    const control = JSON.stringify(toControlState(state, song, 'KZTR', false, deck))
    expect(control).not.toContain('covers')
    expect(control).not.toContain(song.releaseGroupId as string)
  })
})
