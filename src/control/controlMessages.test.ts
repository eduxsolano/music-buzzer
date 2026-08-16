import { describe, expect, test } from 'vitest'
import { parseControlCommand, parseControlMessage } from '@/control/controlMessages'
import { toControlState, type ControlDeck, type ControlState } from '@/control/controlState'
import { initialState, reduce } from '@/game/reducer'
import type { Song } from '@/game/types'

/** Two axes and a chosen option: everything the deck part of the wire carries. */
const deck: ControlDeck = {
  axes: [
    {
      id: 'playlist',
      label: 'Listas',
      options: [
        { axis: 'playlist', value: 'rock-venezolano', label: 'Rock venezolano', count: 156 },
        { axis: 'playlist', value: 'billboard-2026', label: 'Billboard 2026', count: 102 },
      ],
    },
    {
      id: 'decade',
      label: 'Décadas',
      options: [{ axis: 'decade', value: '2020', label: 'Años 2020', count: 105 }],
    },
  ],
  selection: { axis: 'decade', value: '2020' },
  label: 'Años 2020',
  size: 105,
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
}

function sampleState(): ControlState {
  let state = reduce(initialState(), { type: 'JOIN', playerId: 'p1', name: 'Ana' })
  state = reduce(state, { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 })
  state = reduce(state, { type: 'LAUNCH_TIER' })
  state = reduce(state, { type: 'BUZZ', playerId: 'p1' })
  return toControlState(state, song, 'KZTR', true, deck)
}

/** What actually travels: JSON, not the object the host happened to hold. */
function overTheWire(message: unknown): unknown {
  return JSON.parse(JSON.stringify(message))
}

describe('parseControlMessage', () => {
  test('a real projection survives the round trip unchanged', () => {
    const state = sampleState()
    const parsed = parseControlMessage(overTheWire({ type: 'CONTROL_STATE', state }))
    expect(parsed).toEqual({ type: 'CONTROL_STATE', state })
  })

  test('accepts the lobby, where there is no song and no stakes', () => {
    const state = toControlState(initialState(), null, 'KZTR', false, deck)
    expect(parseControlMessage(overTheWire({ type: 'CONTROL_STATE', state }))?.state).toEqual(state)
  })

  test('rejects anything that is not a control state', () => {
    expect(parseControlMessage(null)).toBeNull()
    expect(parseControlMessage('CONTROL_STATE')).toBeNull()
    expect(parseControlMessage([])).toBeNull()
    expect(parseControlMessage({ type: 'STATE', state: sampleState() })).toBeNull()
    expect(parseControlMessage({ type: 'CONTROL_STATE' })).toBeNull()
  })

  test('rejects an unknown phase rather than rendering it', () => {
    const state = { ...sampleState(), phase: 'dancing' }
    expect(parseControlMessage({ type: 'CONTROL_STATE', state })).toBeNull()
  })

  test('rejects a malformed song, a malformed player and a missing flag', () => {
    expect(
      parseControlMessage({ type: 'CONTROL_STATE', state: { ...sampleState(), song: 'Nirvana' } }),
    ).toBeNull()
    expect(
      parseControlMessage({
        type: 'CONTROL_STATE',
        state: { ...sampleState(), players: [{ id: 'p1', name: 'Ana' }] },
      }),
    ).toBeNull()
    expect(
      parseControlMessage({ type: 'CONTROL_STATE', state: { ...sampleState(), canUndo: 'yes' } }),
    ).toBeNull()
  })

  test('rejects a tier that is not a tier', () => {
    expect(
      parseControlMessage({ type: 'CONTROL_STATE', state: { ...sampleState(), launchTier: 4 } }),
    ).toBeNull()
  })

  test('the whole deck, unfiltered, survives the round trip as null', () => {
    const whole: ControlDeck = { ...deck, selection: null, label: 'Todo el mazo', size: 328 }
    const state = { ...sampleState(), deck: whole }
    expect(parseControlMessage(overTheWire({ type: 'CONTROL_STATE', state }))?.state.deck).toEqual(whole)
  })

  test('rejects a malformed deck rather than rendering a selector nobody can trust', () => {
    const bad = [
      { ...sampleState(), deck: undefined },
      { ...sampleState(), deck: 'todo' },
      { ...sampleState(), deck: { ...deck, axes: 'listas' } },
      { ...sampleState(), deck: { ...deck, size: 'muchas' } },
      { ...sampleState(), deck: { ...deck, total: null } },
      { ...sampleState(), deck: { ...deck, selection: { axis: 'mood', value: 'x' } } },
      // An axis with nothing in it would render as a heading over empty space.
      { ...sampleState(), deck: { ...deck, axes: [{ id: 'genre', label: 'Géneros', options: [] }] } },
    ]
    for (const state of bad) {
      expect(parseControlMessage({ type: 'CONTROL_STATE', state })).toBeNull()
    }
  })

  test('rejects an option filed under an axis it does not belong to', () => {
    // The panel sends `{axis, value}` straight back from the option it was
    // shown, so a mismatched pair here becomes a request for a deck the
    // television never offered.
    const state = {
      ...sampleState(),
      deck: {
        ...deck,
        axes: [
          {
            id: 'decade',
            label: 'Décadas',
            options: [{ axis: 'genre', value: 'pop', label: 'Pop', count: 23 }],
          },
        ],
      },
    }
    expect(parseControlMessage({ type: 'CONTROL_STATE', state })).toBeNull()
  })
})

describe('parseControlCommand', () => {
  test('accepts every command the panel can send', () => {
    expect(parseControlCommand({ type: 'HELLO' })).toEqual({ type: 'HELLO' })
    expect(parseControlCommand({ type: 'JUDGE', correct: true })).toEqual({ type: 'JUDGE', correct: true })
    expect(parseControlCommand({ type: 'JUDGE', correct: false })).toEqual({ type: 'JUDGE', correct: false })
    expect(parseControlCommand({ type: 'LAUNCH_TIER' })).toEqual({ type: 'LAUNCH_TIER' })
    expect(parseControlCommand({ type: 'SKIP_SONG' })).toEqual({ type: 'SKIP_SONG' })
    expect(parseControlCommand({ type: 'NEXT_ROUND' })).toEqual({ type: 'NEXT_ROUND' })
    expect(parseControlCommand({ type: 'UNDO' })).toEqual({ type: 'UNDO' })
    expect(parseControlCommand({ type: 'NEW_SESSION' })).toEqual({ type: 'NEW_SESSION' })
    expect(parseControlCommand({ type: 'SELECT_DECK', selection: null })).toEqual({
      type: 'SELECT_DECK',
      selection: null,
    })
    expect(
      parseControlCommand({ type: 'SELECT_DECK', selection: { axis: 'decade', value: '2020' } }),
    ).toEqual({ type: 'SELECT_DECK', selection: { axis: 'decade', value: '2020' } })
  })

  // `null` is a real choice here — the whole deck — so "the field never
  // arrived" cannot be allowed to mean the same thing. A payload that lost
  // its selection must be dropped, not read as a silent reset to the full
  // deck the host did not ask for.
  test('a deck choice whose selection went missing is dropped, never read as the whole deck', () => {
    expect(parseControlCommand({ type: 'SELECT_DECK' })).toBeNull()
  })

  test('a deck choice on an axis that does not exist is refused', () => {
    expect(parseControlCommand({ type: 'SELECT_DECK', selection: { axis: 'mood', value: 'x' } })).toBeNull()
    expect(parseControlCommand({ type: 'SELECT_DECK', selection: { axis: 'decade' } })).toBeNull()
    expect(parseControlCommand({ type: 'SELECT_DECK', selection: { axis: 'decade', value: '' } })).toBeNull()
    expect(parseControlCommand({ type: 'SELECT_DECK', selection: 'decade' })).toBeNull()
    expect(parseControlCommand({ type: 'SELECT_DECK', selection: [] })).toBeNull()
  })

  // A JUDGE whose verdict went missing must be dropped, not read as a ❌ that
  // costs somebody a point and puts them out of the song.
  test('a judgement without a real boolean verdict is dropped, never guessed', () => {
    expect(parseControlCommand({ type: 'JUDGE' })).toBeNull()
    expect(parseControlCommand({ type: 'JUDGE', correct: 'true' })).toBeNull()
    expect(parseControlCommand({ type: 'JUDGE', correct: 1 })).toBeNull()
    expect(parseControlCommand({ type: 'JUDGE', correct: null })).toBeNull()
  })

  test('ignores anything else that lands on the channel', () => {
    expect(parseControlCommand(null)).toBeNull()
    expect(parseControlCommand('UNDO')).toBeNull()
    expect(parseControlCommand({ type: 'START_GAME' })).toBeNull()
    expect(parseControlCommand({ type: 'CONTROL_STATE', state: sampleState() })).toBeNull()
  })
})
