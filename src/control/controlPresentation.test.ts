import { describe, expect, test } from 'vitest'
import {
  controlLaunchLabel,
  controlMood,
  controlPrompt,
  stakeLabel,
} from '@/control/controlPresentation'
import type { ControlState } from '@/control/controlState'

const base: ControlState = {
  room: 'KZTR',
  phase: 'waiting',
  roundsPlayed: 3,
  roundsTotal: 20,
  song: { title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991 },
  buzzedName: null,
  buzzedPoints: null,
  launchTier: 2,
  launchResumesAtMs: 0,
  pointsAtStake: 5,
  outcome: null,
  winnerName: null,
  canUndo: false,
  players: [],
  deck: { axes: [], selection: null, label: 'Todo el mazo', size: 328, total: 328 },
}

describe('controlMood', () => {
  test('the phone is coloured exactly like the television', () => {
    expect(controlMood('lobby', null, null)).toBe('idle')
    expect(controlMood('waiting', null, 5)).toBe('hold')
    expect(controlMood('playing', null, 5)).toBe('live')
    expect(controlMood('buzzed', null, 5)).toBe('buzzed')
    expect(controlMood('finished', null, null)).toBe('over')
  })

  // The bug this guards against: the panel used to colour every `waiting`
  // phase `hold`, including the round's opening wait — before the host has
  // launched tier 1 even once — where a press cannot score. The television
  // reads that wait as `idle` (see `moodFor` in stagePresentation.ts); the
  // host's own phone must agree, or the one person judging the room is shown
  // a tense colour for a press that does nothing.
  test('the opening wait, where a press cannot score, reads idle like the television — not hold', () => {
    expect(controlMood('waiting', null, null)).toBe('idle')
  })

  test('a reveal is coloured by what happened, not by the fact it happened', () => {
    expect(controlMood('revealed', 'correct', null)).toBe('correct')
    expect(controlMood('revealed', 'allWrong', null)).toBe('wrong')
    expect(controlMood('revealed', 'timeout', null)).toBe('idle')
    expect(controlMood('revealed', 'skipped', null)).toBe('idle')
  })
})

describe('controlPrompt', () => {
  test('names whoever the host is waiting on', () => {
    expect(controlPrompt({ ...base, phase: 'buzzed', buzzedName: 'Ana' })).toBe('Pulsó Ana')
  })

  test('tells a fresh tier apart from music that was cut', () => {
    expect(controlPrompt(base)).toBe('Listo para el siguiente tramo')
    expect(controlPrompt({ ...base, launchResumesAtMs: 2_400 })).toBe('La música está cortada')
  })

  test('repeats the television headline at the reveal', () => {
    expect(controlPrompt({ ...base, phase: 'revealed', outcome: 'correct', winnerName: 'Beto' })).toBe(
      'Acertó Beto',
    )
    expect(controlPrompt({ ...base, phase: 'revealed', outcome: 'timeout' })).toBe('Nadie pulsó')
  })

  test('says something in every phase', () => {
    for (const phase of ['lobby', 'waiting', 'playing', 'buzzed', 'revealed', 'finished'] as const) {
      expect(controlPrompt({ ...base, phase }).length).toBeGreaterThan(0)
    }
  })
})

describe('controlLaunchLabel', () => {
  test('promises what the television promises', () => {
    expect(controlLaunchLabel(base)).toBe('Sonar 10 segundos')
    expect(controlLaunchLabel({ ...base, launchResumesAtMs: 2_400 })).toBe('Retomar donde se cortó')
  })

  test('there is nothing to launch outside the pause', () => {
    expect(controlLaunchLabel({ ...base, phase: 'playing' })).toBeNull()
    expect(controlLaunchLabel({ ...base, phase: 'buzzed' })).toBeNull()
    expect(controlLaunchLabel({ ...base, phase: 'waiting', launchTier: null })).toBeNull()
  })
})

describe('stakeLabel', () => {
  test('counts in Spanish', () => {
    expect(stakeLabel(1)).toBe('1 punto en juego')
    expect(stakeLabel(3)).toBe('3 puntos en juego')
    expect(stakeLabel(null)).toBeNull()
  })
})
