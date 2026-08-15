import { describe, expect, test } from 'vitest'
import { parseControlCommand, parseControlMessage } from '@/control/controlMessages'
import { toControlState, type ControlState } from '@/control/controlState'
import { initialState, reduce } from '@/game/reducer'
import type { Song } from '@/game/types'

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
  return toControlState(state, song, 'KZTR', true)
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
    const state = toControlState(initialState(), null, 'KZTR', false)
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
