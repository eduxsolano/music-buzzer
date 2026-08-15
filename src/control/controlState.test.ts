import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import { toPublicState } from '@/game/publicState'
import { toControlState } from '@/control/controlState'
import type { GameEvent, GameState, Song } from '@/game/types'

const song: Song = {
  id: 's1',
  videoId: 'hTWKbfoikeg',
  title: 'Smells Like Teen Spirit',
  artist: 'Nirvana',
  year: 1991,
  startSeconds: 42,
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
    const control = toControlState(play(start), song, 'KZTR', false)
    expect(control.song).toEqual({ title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991 })
    expect(control.room).toBe('KZTR')
  })

  test('who is being judged and what their answer is worth', () => {
    const state = play([...start, { type: 'LAUNCH_TIER' }, { type: 'BUZZ', playerId: 'p2' }])
    const control = toControlState(state, song, 'KZTR', false)

    expect(control.buzzedName).toBe('Beto')
    expect(control.buzzedPoints).toBe(5)
    expect(control.pointsAtStake).toBe(5)
  })

  test('the pause reports the tier the launch button will sound and where it resumes', () => {
    const state = play([
      ...start,
      { type: 'LAUNCH_TIER' },
      { type: 'TICK', deltaMs: 2_400 },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: false },
    ])
    const control = toControlState(state, song, 'KZTR', true)

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
    const control = toControlState(state, song, 'KZTR', true)

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
    const control = toControlState(state, song, 'KZTR', true)

    expect(control.outcome).toBe('correct')
    expect(control.winnerName).toBe('Beto')
  })

  test('no song dealt means no card', () => {
    expect(toControlState(initialState(), null, 'KZTR', false).song).toBeNull()
  })

  test('nothing in it changes on a tick, so the private channel stays quiet too', () => {
    const running = play([...start, { type: 'LAUNCH_TIER' }])
    const later = reduce(reduce(running, { type: 'TICK', deltaMs: 50 }), { type: 'TICK', deltaMs: 50 })

    expect(toControlState(later, song, 'KZTR', false)).toEqual(
      toControlState(running, song, 'KZTR', false),
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
    }
  })

  test('the host phone is told exactly what the players are not', () => {
    const state = play([...start, { type: 'LAUNCH_TIER' }])
    expect(JSON.stringify(toControlState(state, song, 'KZTR', false))).toContain(song.title)
  })
})
