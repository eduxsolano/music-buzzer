import { describe, expect, it } from 'vitest'
import type { Phase, Player } from '@/game/types'
import {
  finalNote,
  finalStanding,
  heroSizeClass,
  joinNames,
  launchLabel,
  moodFor,
  playersConnectedLabel,
  pointsLabel,
  revealDetail,
  revealHeadline,
  roundLabel,
  tierClockFor,
  tierProgress,
  waitingNote,
} from '@/host/ui/stagePresentation'

function player(name: string, score: number): Player {
  return { id: name.toLowerCase(), name, score }
}

describe('moodFor', () => {
  it('is cool and quiet while the song plays', () => {
    expect(moodFor({ kind: 'lobby' }, null)).toBe('idle')
    expect(moodFor({ kind: 'playing', tier: 1, elapsedMs: 0 }, null)).toBe('live')
  })

  it('turns amber the instant someone buzzes', () => {
    expect(
      moodFor(
        { kind: 'buzzed', playerId: 'p1', worthTier: 2, launchTier: 2, resumeAtMs: 900 },
        null,
      ),
    ).toBe('buzzed')
  })

  it('holds its breath between tiers rather than looking like the lobby', () => {
    const held = moodFor(
      { kind: 'waiting', worthTier: 1, launchTier: 2, resumeAtMs: 0, heardThisRound: true },
      null,
    )
    expect(held).toBe('hold')
    expect(held).not.toBe(moodFor({ kind: 'lobby' }, null))
  })

  it('reads as an invitation to start, not a held breath, before tier 1 has ever launched', () => {
    const opening = moodFor(
      { kind: 'waiting', worthTier: 1, launchTier: 1, resumeAtMs: 0, heardThisRound: false },
      null,
    )
    expect(opening).toBe('idle')
    expect(opening).toBe(moodFor({ kind: 'lobby' }, null))
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
    expect(
      tierClockFor({
        kind: 'buzzed',
        playerId: 'p1',
        worthTier: 1,
        launchTier: 1,
        resumeAtMs: 2_100,
      }),
    ).toEqual({ tier: 1, elapsedMs: 2_100 })
  })

  it('shows the tier the host is about to launch, full, while waiting', () => {
    expect(
      tierClockFor({
        kind: 'waiting',
        worthTier: 1,
        launchTier: 2,
        resumeAtMs: 0,
        heardThisRound: true,
      }),
    ).toEqual({
      tier: 2,
      elapsedMs: 0,
    })
  })

  it('keeps a cut tier drained while the host holds it, so nothing jumps back', () => {
    expect(
      tierClockFor({
        kind: 'waiting',
        worthTier: 2,
        launchTier: 2,
        resumeAtMs: 3_000,
        heardThisRound: true,
      }),
    ).toEqual({ tier: 2, elapsedMs: 3_000 })
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

describe('launchLabel', () => {
  it('names the duration of a tier nobody has heard yet', () => {
    expect(launchLabel(1, 0)).toBe('Sonar 5 segundos')
    expect(launchLabel(2, 0)).toBe('Sonar 10 segundos')
    expect(launchLabel(3, 0)).toBe('Sonar 15 segundos')
  })

  it('says it is picking up a cut tier rather than starting one', () => {
    expect(launchLabel(2, 3_000)).toBe('Retomar donde se cortó')
  })

  it('treats a cut at the very first millisecond as a fresh tier', () => {
    // Buzzing at 0 ms leaves nothing to resume: playing from the start IS the
    // resume, and promising the room a continuation would be a lie.
    expect(launchLabel(2, 0)).toBe('Sonar 10 segundos')
  })
})

describe('waitingNote', () => {
  it('pluralises the points still on the table', () => {
    expect(waitingNote(5)).toBe('puntos en juego ahora')
    expect(waitingNote(1)).toBe('punto en juego ahora')
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

describe('revealDetail', () => {
  it('says who the points went to, so the rail does not have to be read backwards', () => {
    expect(revealDetail('correct', 'Marta')).toBe('Los puntos son para Marta')
    expect(revealDetail('correct', null)).toBe('Respuesta correcta')
  })

  it('explains a round nobody won', () => {
    expect(revealDetail('allWrong', null)).toBe('Todos quedaron fuera de esta canción')
    expect(revealDetail('timeout', null)).toBe('Se acabó el tiempo y nadie pulsó')
    expect(revealDetail('skipped', null)).toBe('Sin puntos para nadie')
  })
})

describe('finalStanding', () => {
  it('crowns a clear winner', () => {
    expect(finalStanding([player('Ana', 12), player('Beto', 7)])).toEqual({
      kind: 'winner',
      name: 'Ana',
      score: 12,
    })
  })

  // The television used to name whoever sorted first, which in a room of six
  // people who have been counting all night is the one mistake nobody forgets.
  it('refuses to pick one of several people who are level', () => {
    expect(finalStanding([player('Ana', 9), player('Beto', 9), player('Carla', 4)])).toEqual({
      kind: 'tie',
      names: ['Ana', 'Beto'],
      score: 9,
    })
  })

  it('reads a tie at zero, and a tie below it, as a tie all the same', () => {
    expect(finalStanding([player('Ana', 0), player('Beto', 0)]).kind).toBe('tie')
    expect(finalStanding([player('Ana', -2), player('Beto', -2)]).kind).toBe('tie')
  })

  it('says nobody rather than inventing a winner for an empty game', () => {
    expect(finalStanding([])).toEqual({ kind: 'nobody' })
  })
})

describe('final copy', () => {
  it('names everybody in the tie', () => {
    expect(finalNote({ kind: 'tie', names: ['Ana', 'Beto'], score: 9 })).toBe('Ana y Beto · 9 puntos')
    expect(finalNote({ kind: 'tie', names: ['Ana', 'Beto', 'Carla'], score: 1 })).toBe(
      'Ana, Beto y Carla · 1 punto',
    )
  })

  it('keeps the winner screen to a score', () => {
    expect(finalNote({ kind: 'winner', name: 'Ana', score: 12 })).toBe('12 puntos')
    expect(finalNote({ kind: 'nobody' })).toBe('Sin jugadores')
  })

  it('pluralises around one, including below zero', () => {
    expect(pointsLabel(1)).toBe('1 punto')
    expect(pointsLabel(-1)).toBe('-1 punto')
    expect(pointsLabel(0)).toBe('0 puntos')
    expect(pointsLabel(2)).toBe('2 puntos')
  })

  it('lists names the way they would be said out loud', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['Ana'])).toBe('Ana')
    expect(joinNames(['Ana', 'Beto'])).toBe('Ana y Beto')
    expect(joinNames(['Ana', 'Beto', 'Carla'])).toBe('Ana, Beto y Carla')
  })
})
