import { describe, expect, it } from 'vitest'
import { BUTTON_PRESENTATION } from '@/play/buttonPresentation'
import { buttonState, type ButtonState } from '@/play/playerIdentity'
import type { PublicState } from '@/game/publicState'

const ALL_STATES: ButtonState[] = [
  'connecting',
  'armed',
  'locked',
  'won',
  'celebrating',
  'eliminated',
]

function publicState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'playing',
    players: [{ id: 'p1', name: 'Ana', score: 0 }],
    lockedOut: [],
    buzzedPlayerId: null,
    outcome: null,
    winnerId: null,
    pointsAtStake: 5,
    tierDurationMs: 5_000,
    remainingMs: 5_000,
    roundsPlayed: 1,
    roundsTotal: 20,
    ...overrides,
  }
}

describe('button presentation', () => {
  it('covers every state the phone can be in', () => {
    expect(Object.keys(BUTTON_PRESENTATION).sort()).toEqual([...ALL_STATES].sort())
  })

  it.each(ALL_STATES)('%s has a label a player can read in the dark', (state) => {
    const { label } = BUTTON_PRESENTATION[state]
    expect(label.trim()).not.toBe('')
    // Short enough to stay one line on a 390px-wide phone at display size.
    expect(label.length).toBeLessThanOrEqual(12)
  })

  it('only invites a press when the button can actually be pressed', () => {
    const breathing = ALL_STATES.filter((s) => BUTTON_PRESENTATION[s].motion === 'breathe')
    expect(breathing).toEqual(['armed'])
  })

  it('celebrates winning the race and being right, and nothing else', () => {
    const bursting = ALL_STATES.filter((s) => BUTTON_PRESENTATION[s].motion === 'burst')
    expect(bursting).toEqual(['won', 'celebrating'])
  })

  it('tells the winner what to do next', () => {
    expect(BUTTON_PRESENTATION.won.hint).toMatch(/voz alta/)
  })

  it('reassures an eliminated player that they are only out of this song', () => {
    expect(BUTTON_PRESENTATION.eliminated.hint).toMatch(/siguiente canción/)
  })

  it('has a presentation for whatever buttonState actually returns', () => {
    const cases: PublicState[] = [
      publicState({ phase: 'lobby' }),
      publicState({ phase: 'waiting' }),
      publicState({ phase: 'playing' }),
      publicState({ phase: 'buzzed', buzzedPlayerId: 'p1' }),
      publicState({ phase: 'buzzed', buzzedPlayerId: 'other' }),
      publicState({ lockedOut: ['p1'] }),
      publicState({ phase: 'revealed' }),
      publicState({ phase: 'revealed', outcome: 'correct', winnerId: 'p1' }),
      publicState({ phase: 'finished' }),
    ]
    for (const state of [null, ...cases]) {
      expect(BUTTON_PRESENTATION[buttonState(state, 'p1')]).toBeDefined()
    }
  })
})
