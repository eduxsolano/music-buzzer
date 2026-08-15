import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import { initialSession, step, undoJudgement, type HostSession } from '@/host/undo'
import type { GameEvent, GameState } from '@/game/types'

function play(events: GameEvent[], from: GameState = initialState()): GameState {
  return events.reduce(reduce, from)
}

function session(events: GameEvent[]): HostSession {
  return events.reduce(step, initialSession(initialState()))
}

const twoPlayers: GameEvent[] = [
  { type: 'JOIN', playerId: 'p1', name: 'Ana' },
  { type: 'JOIN', playerId: 'p2', name: 'Beto' },
  { type: 'START_GAME', deck: ['s1', 's2', 's3'], roundsTotal: 3 },
]

describe('undoing a judgement', () => {
  test('nothing to undo before anybody has been judged', () => {
    const current = session([...twoPlayers, { type: 'LAUNCH_TIER' }, { type: 'BUZZ', playerId: 'p1' }])
    expect(current.undo).toBeNull()
    expect(undoJudgement(current)).toBe(current)
  })

  test('a mistaken wrong answer gives back the point, the elimination and the phase', () => {
    const buzzed = session([
      ...twoPlayers,
      { type: 'LAUNCH_TIER' },
      { type: 'TICK', deltaMs: 1_500 },
      { type: 'BUZZ', playerId: 'p1' },
    ])
    const judged = step(buzzed, { type: 'JUDGE', correct: false })

    expect(judged.game.players.find((p) => p.id === 'p1')?.score).toBe(-1)
    expect(judged.game.lockedOut).toEqual(['p1'])
    expect(judged.game.phase.kind).toBe('waiting')

    const undone = undoJudgement(judged)
    expect(undone.game).toEqual(buzzed.game)
    expect(undone.game.players.find((p) => p.id === 'p1')?.score).toBe(0)
    expect(undone.game.lockedOut).toEqual([])
    expect(undone.game.phase).toEqual({
      kind: 'buzzed',
      playerId: 'p1',
      worthTier: 1,
      launchTier: 1,
      resumeAtMs: 1_500,
    })
  })

  test('the frozen stakes come back exactly, down to the millisecond of the cut', () => {
    const buzzed = session([
      ...twoPlayers,
      { type: 'LAUNCH_TIER' },
      { type: 'TICK', deltaMs: 5_000 },
      { type: 'LAUNCH_TIER' },
      { type: 'TICK', deltaMs: 3_350 },
      { type: 'BUZZ', playerId: 'p2' },
    ])
    const undone = undoJudgement(step(buzzed, { type: 'JUDGE', correct: false }))

    // Worth tier 2's points, resuming 3.35 s into tier 2: the whole point of
    // restoring the state whole instead of reconstructing it.
    expect(undone.game.phase).toEqual({
      kind: 'buzzed',
      playerId: 'p2',
      worthTier: 2,
      launchTier: 2,
      resumeAtMs: 3_350,
    })
  })

  test('a mistaken correct answer takes the points back off the board', () => {
    const buzzed = session([...twoPlayers, { type: 'LAUNCH_TIER' }, { type: 'BUZZ', playerId: 'p1' }])
    const judged = step(buzzed, { type: 'JUDGE', correct: true })

    expect(judged.game.players.find((p) => p.id === 'p1')?.score).toBe(5)
    expect(judged.game.phase.kind).toBe('revealed')

    const undone = undoJudgement(judged)
    expect(undone.game.players.find((p) => p.id === 'p1')?.score).toBe(0)
    expect(undone.game.phase.kind).toBe('buzzed')
  })

  test('undoing the judgement that closed a round everybody failed reopens it', () => {
    const buzzed = session([
      ...twoPlayers,
      { type: 'LAUNCH_TIER' },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: false },
      { type: 'BUZZ', playerId: 'p2' },
    ])
    const judged = step(buzzed, { type: 'JUDGE', correct: false })
    expect(judged.game.phase).toEqual({ kind: 'revealed', outcome: 'allWrong', winnerId: null })

    const undone = undoJudgement(judged)
    expect(undone.game.phase.kind).toBe('buzzed')
    expect(undone.game.lockedOut).toEqual(['p1'])
    expect(undone.game.players.find((p) => p.id === 'p2')?.score).toBe(0)
  })

  test('it is one shot: a second undo cannot walk further back', () => {
    const judged = session([
      ...twoPlayers,
      { type: 'LAUNCH_TIER' },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: false },
    ])
    const once = undoJudgement(judged)
    expect(once.undo).toBeNull()
    expect(undoJudgement(once)).toBe(once)
  })

  test('undo survives the tier being launched again on the same song', () => {
    const judged = session([
      ...twoPlayers,
      { type: 'LAUNCH_TIER' },
      { type: 'TICK', deltaMs: 2_000 },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: false },
    ])
    const resumed = step(step(judged, { type: 'LAUNCH_TIER' }), { type: 'TICK', deltaMs: 500 })

    expect(resumed.undo).not.toBeNull()
    expect(undoJudgement(resumed).game.phase.kind).toBe('buzzed')
  })

  test('dealing the next round closes the offer', () => {
    const judged = session([
      ...twoPlayers,
      { type: 'LAUNCH_TIER' },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: true },
    ])
    expect(judged.undo).not.toBeNull()

    const next = step(judged, { type: 'NEXT_ROUND' })
    expect(next.undo).toBeNull()
    expect(undoJudgement(next)).toBe(next)
  })

  test('the end of the game closes the offer too', () => {
    const lastRound: GameEvent[] = [
      { type: 'JOIN', playerId: 'p1', name: 'Ana' },
      { type: 'START_GAME', deck: ['s1'], roundsTotal: 1 },
      { type: 'LAUNCH_TIER' },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: true },
    ]
    const finished = step(session(lastRound), { type: 'NEXT_ROUND' })

    expect(finished.game.phase.kind).toBe('finished')
    expect(finished.undo).toBeNull()
  })

  test('a judgement the engine ignored does not arm an undo', () => {
    const playing = session([...twoPlayers, { type: 'LAUNCH_TIER' }])
    const ignored = step(playing, { type: 'JUDGE', correct: false })

    expect(ignored).toBe(playing)
    expect(ignored.undo).toBeNull()
  })

  test('a buzz from somebody eliminated leaves the session untouched', () => {
    const after = session([
      ...twoPlayers,
      { type: 'LAUNCH_TIER' },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: false },
      { type: 'LAUNCH_TIER' },
    ])
    expect(step(after, { type: 'BUZZ', playerId: 'p1' })).toBe(after)
  })

  test('the reducer itself never learns about undo', () => {
    // The game the reducer produces on its own is byte-for-byte the game the
    // session wrapper produces: `step` adds a memory, never a rule.
    const events: GameEvent[] = [
      ...twoPlayers,
      { type: 'LAUNCH_TIER' },
      { type: 'TICK', deltaMs: 2_000 },
      { type: 'BUZZ', playerId: 'p1' },
      { type: 'JUDGE', correct: false },
      { type: 'LAUNCH_TIER' },
      { type: 'BUZZ', playerId: 'p2' },
      { type: 'JUDGE', correct: true },
    ]
    expect(session(events).game).toEqual(play(events))
  })
})
