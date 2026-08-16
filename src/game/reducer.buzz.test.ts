import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

/** A game with tier 1 already sounding: every round now starts held by the host. */
function gameWith(names: string[]): GameState {
  const joined = names.reduce(
    (state, name) => reduce(state, { type: 'JOIN', playerId: name, name }),
    initialState(),
  )
  const dealt = reduce(joined, { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 })
  return reduce(dealt, { type: 'LAUNCH_TIER' })
}

/** A game dealt but held at the very start: the host has not launched tier 1 yet. */
function dealtGame(names: string[]): GameState {
  const joined = names.reduce(
    (state, name) => reduce(state, { type: 'JOIN', playerId: name, name }),
    initialState(),
  )
  return reduce(joined, { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 })
}

function scoreOf(state: GameState, id: string): number {
  const player = state.players.find((p) => p.id === id)
  if (!player) throw new Error(`No player ${id}`)
  return player.score
}

describe('buzzing', () => {
  test('freezes what the press is worth and where the music was cut', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 4_999 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    expect(state.phase).toEqual({
      kind: 'buzzed',
      playerId: 'ana',
      worthTier: 1,
      launchTier: 1,
      resumeAtMs: 4_999,
    })
  })

  test('a press during the pause between tiers earns the tier that just played', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    expect(state.phase).toMatchObject({ kind: 'waiting', worthTier: 1, launchTier: 2 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    expect(state.phase).toEqual({
      kind: 'buzzed',
      playerId: 'ana',
      worthTier: 1,
      launchTier: 2,
      resumeAtMs: 0,
    })
  })

  test('a press in the lobby does nothing', () => {
    const lobby = reduce(initialState(), { type: 'JOIN', playerId: 'ana', name: 'ana' })
    expect(reduce(lobby, { type: 'BUZZ', playerId: 'ana' })).toBe(lobby)
  })

  test('two near-simultaneous presses produce exactly one winner', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    expect(state.phase).toMatchObject({ kind: 'buzzed', playerId: 'ana' })
  })

  test('a press from an unknown player does nothing', () => {
    const state = gameWith(['ana'])
    expect(reduce(state, { type: 'BUZZ', playerId: 'ghost' })).toBe(state)
  })

  test('a press from an eliminated player does nothing', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(reduce(state, { type: 'BUZZ', playerId: 'ana' })).toBe(state)
  })

  test('a press while the song is revealed does nothing', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(reduce(state, { type: 'BUZZ', playerId: 'ana' })).toBe(state)
  })
})

describe('judging a correct answer', () => {
  test('awards the frozen tier value, however late the judgement arrives', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 4_999 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'TICK', deltaMs: 60_000 }) // the host takes their time
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(5)
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'correct', winnerId: 'ana' })
  })

  test('pressing just past the boundary is worth the next tier down', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' }) // tier 2 sounding, 0 ms in
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(3)
  })

  test('the third tier is worth two points', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'TICK', deltaMs: 10_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(2)
  })
})

describe('judging a wrong answer', () => {
  test('costs one point and eliminates only that player from this song', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(scoreOf(state, 'ana')).toBe(-1)
    expect(scoreOf(state, 'beto')).toBe(0)
    expect(state.lockedOut).toEqual(['ana'])
  })

  test('scores may go negative', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'NEXT_ROUND' })
    state = reduce(state, { type: 'LAUNCH_TIER' }) // the new round's own tier 1, not carried over
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(scoreOf(state, 'ana')).toBe(-2)
  })

  test('the audio resumes at the exact cut point, in the same tier', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'TICK', deltaMs: 3_000 }) // tier 2, 3 s in
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    // The room goes quiet and the host decides when the music comes back —
    // but it comes back on the very tier that was cut, at the very
    // millisecond it was cut, and it is still worth that tier.
    expect(state.phase).toEqual({
      kind: 'waiting',
      worthTier: 2,
      launchTier: 2,
      resumeAtMs: 3_000,
      heardThisRound: true,
    })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    expect(state.phase).toEqual({ kind: 'playing', tier: 2, elapsedMs: 3_000 })
  })

  // The wrong-answer case the fix has to get right on purpose: a press at
  // elapsedMs 0 of tier 1 freezes to exactly the same three Stakes fields a
  // freshly dealt round starts on (`worthTier: 1, launchTier: 1,
  // resumeAtMs: 0`). Judging it wrong must not leave the round back on the
  // round's un-pressable opening wait — the tier WAS launched, the room DID
  // hear the music start, and the resume-after-a-wrong-answer rule must stay
  // exactly as it always was: the wait it returns to stays pressable.
  test('a wrong answer at the very start of a tier still leaves a pressable wait', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' }) // elapsedMs 0, tier 1
    expect(state.phase).toEqual({
      kind: 'buzzed',
      playerId: 'ana',
      worthTier: 1,
      launchTier: 1,
      resumeAtMs: 0,
    })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(state.phase).toEqual({
      kind: 'waiting',
      worthTier: 1,
      launchTier: 1,
      resumeAtMs: 0,
      heardThisRound: true,
    })
    // Pressable, and worth what it always was — this is not a new hand-out,
    // it is the frozen tier 1 value the resume rule has always paid.
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'beto')).toBe(5)
  })

  test('a press during the pause after a wrong answer keeps that tier, cut point and all', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' })
    state = reduce(state, { type: 'TICK', deltaMs: 3_000 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    expect(state.phase).toEqual({
      kind: 'buzzed',
      playerId: 'beto',
      worthTier: 2,
      launchTier: 2,
      resumeAtMs: 3_000,
    })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'beto')).toBe(3)
  })

  test('an eliminated player is available again on the next song', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.lockedOut).toEqual([])
    state = reduce(state, { type: 'LAUNCH_TIER' }) // the new round's own tier 1
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    expect(state.phase).toMatchObject({ kind: 'buzzed', playerId: 'ana' })
  })

  test('when everybody is eliminated the round closes with nobody scoring', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'BUZZ', playerId: 'beto' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'allWrong', winnerId: null })
  })

  test('a judgement with nobody buzzed does nothing', () => {
    const state = gameWith(['ana'])
    expect(reduce(state, { type: 'JUDGE', correct: true })).toBe(state)
  })
})

/**
 * End-to-end proof that the fix is real at the engine level, not just in the
 * `Stakes` constants: drives whole rounds through `reduce` and checks the
 * resulting state, exactly as the actual game does.
 */
describe('the round only becomes pressable once something has played', () => {
  test('buzzing before the first LAUNCH_TIER is a no-op, even blind-guessed instantly', () => {
    const dealt = dealtGame(['ana'])
    // This is the exact bug: a round is dealt straight into `waiting`, and a
    // player could press before a single note of tier 1 had sounded.
    const afterBuzz = reduce(dealt, { type: 'BUZZ', playerId: 'ana' })
    expect(afterBuzz).toBe(dealt) // same reference: the reducer bailed out
    expect(afterBuzz.phase.kind).toBe('waiting')
    expect(scoreOf(afterBuzz, 'ana')).toBe(0)
  })

  test('once tier 1 is launched, the first between-tier pause pays exactly what it always did', () => {
    let state = dealtGame(['ana'])
    state = reduce(state, { type: 'LAUNCH_TIER' }) // tier 1 sounding now
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 }) // tier 1 runs out
    expect(state.phase).toMatchObject({ kind: 'waiting', worthTier: 1, heardThisRound: true })
    // Pressable now, unlike the wait one tick earlier — and worth tier 1's
    // full value, exactly as the pause-pays-the-last-tier rule always said.
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(5)
  })

  test('the tier point values are exactly what they were: 5, 3, then 2', () => {
    let state = dealtGame(['ana'])
    state = reduce(state, { type: 'LAUNCH_TIER' }) // tier 1
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' }) // tier 2
    state = reduce(state, { type: 'TICK', deltaMs: 10_000 })
    state = reduce(state, { type: 'LAUNCH_TIER' }) // tier 3
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(2)
    // Tier 1 (5) and tier 2 (3) are proven the same way in the "judging a
    // correct answer" tests above; this closes the loop on tier 3.
  })
})
