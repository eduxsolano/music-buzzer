import { describe, expect, it } from 'vitest'
import type { Phase } from '@/game/types'
import {
  heroSizeClass,
  moodFor,
  playersConnectedLabel,
  revealHeadline,
  roundLabel,
  tierClockFor,
  tierProgress,
} from '@/host/ui/stagePresentation'

describe('moodFor', () => {
  it('is cool and quiet while the song plays', () => {
    expect(moodFor({ kind: 'lobby' }, null)).toBe('idle')
    expect(moodFor({ kind: 'playing', tier: 1, elapsedMs: 0 }, null)).toBe('live')
  })

  it('turns amber the instant someone buzzes', () => {
    expect(moodFor({ kind: 'buzzed', tier: 2, elapsedMs: 900, playerId: 'p1' }, null)).toBe('buzzed')
  })

  it('shows the judgement even though a wrong answer returns to playing', () => {
    const backToPlaying: Phase = { kind: 'playing', tier: 2, elapsedMs: 900 }
    expect(moodFor(backToPlaying, 'wrong')).toBe('wrong')
    expect(moodFor(backToPlaying, 'correct')).toBe('correct')
  })

  it('colours the reveal by what actually happened', () => {
    expect(moodFor({ kind: 'revealed', outcome: 'correct', winnerId: 'p1' }, null)).toBe('correct')
    expect(moodFor({ kind: 'revealed', outcome: 'allWrong', winnerId: null }, null)).toBe('wrong')
    expect(moodFor({ kind: 'revealed', outcome: 'timeout', winnerId: null }, null)).toBe('idle')
    expect(moodFor({ kind: 'revealed', outcome: 'skipped', winnerId: null }, null)).toBe('idle')
  })

  it('ends the game on its own mood', () => {
    expect(moodFor({ kind: 'finished' }, null)).toBe('over')
  })
})

describe('tierClockFor', () => {
  it('runs while the song plays', () => {
    expect(tierClockFor({ kind: 'playing', tier: 2, elapsedMs: 1_500 })).toEqual({
      tier: 2,
      elapsedMs: 1_500,
    })
  })

  it('freezes on a buzz instead of clearing, so the room sees what was left', () => {
    expect(tierClockFor({ kind: 'buzzed', tier: 1, elapsedMs: 2_100, playerId: 'p1' })).toEqual({
      tier: 1,
      elapsedMs: 2_100,
    })
  })

  it('is empty in every phase where no tier is in play', () => {
    const empty = { tier: null, elapsedMs: 0 }
    expect(tierClockFor({ kind: 'lobby' })).toEqual(empty)
    expect(tierClockFor({ kind: 'revealed', outcome: 'correct', winnerId: 'p1' })).toEqual(empty)
    expect(tierClockFor({ kind: 'finished' })).toEqual(empty)
  })
})

describe('tierProgress', () => {
  it('reports the fraction of the tier already spent', () => {
    expect(tierProgress(2_500, 5_000)).toBeCloseTo(0.5, 10)
  })

  it('clamps at both ends so the meter never overflows its track', () => {
    expect(tierProgress(-100, 5_000)).toBe(0)
    expect(tierProgress(9_000, 5_000)).toBe(1)
  })

  it('is empty rather than infinite when the duration is missing', () => {
    expect(tierProgress(1_000, 0)).toBe(0)
  })
})

describe('heroSizeClass', () => {
  it('gives the largest size to short text', () => {
    expect(heroSizeClass('5')).toBe('hero-xl')
    expect(heroSizeClass('Ana')).toBe('hero-xl')
  })

  it('steps down as the text gets longer', () => {
    expect(heroSizeClass('Guadalupe')).toBe('hero-lg')
    expect(heroSizeClass('Smells Like')).toBe('hero-md')
    expect(heroSizeClass('Smells Like Teen Spirit')).toBe('hero-sm')
  })

  it('ignores surrounding whitespace', () => {
    expect(heroSizeClass('  Ana  ')).toBe('hero-xl')
  })

  it('counts accented characters once', () => {
    expect(heroSizeClass('Jesús')).toBe('hero-xl')
  })
})

describe('revealHeadline', () => {
  it('names the winner on a correct answer', () => {
    expect(revealHeadline('correct', 'Marta')).toBe('Acertó Marta')
  })

  it('still reads correctly if the winner left', () => {
    expect(revealHeadline('correct', null)).toBe('Respuesta correcta')
  })

  it('explains every way a round can end without a winner', () => {
    expect(revealHeadline('allWrong', null)).toBe('Nadie acertó')
    expect(revealHeadline('timeout', null)).toBe('Nadie pulsó')
    expect(revealHeadline('skipped', null)).toBe('Canción saltada')
  })
})

describe('lobby and round copy', () => {
  it('pluralises the connected players', () => {
    expect(playersConnectedLabel(0)).toBe('Esperando jugadores')
    expect(playersConnectedLabel(1)).toBe('1 jugador conectado')
    expect(playersConnectedLabel(4)).toBe('4 jugadores conectados')
  })

  it('numbers the round', () => {
    expect(roundLabel(3, 20)).toBe('Canción 3 de 20')
  })
})
