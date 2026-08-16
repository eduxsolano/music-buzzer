import type { Phase, Player, RevealOutcome } from '@/game/types'
import { tierDurationMs, type Tier } from '@/game/tiers'

/**
 * The presentation vocabulary of the host screen, kept pure so it can be
 * tested and so the phase components stay pure layout.
 *
 * The idea the whole screen is built on: **the colour says what happened.**
 * From the sofa, four metres away, the room reads the mood before it reads a
 * word — cool while the song plays, amber the instant someone presses, green
 * or red on the judgement.
 */
export type Mood = 'idle' | 'hold' | 'live' | 'buzzed' | 'correct' | 'wrong' | 'over'

/** A judgement just delivered, held for a beat so the room registers it. */
export type Judgement = 'correct' | 'wrong'

/**
 * The `judgement` flash deliberately outranks the phase: a ❌ sends the game
 * straight back to `playing`, and without the flash the red would never be
 * seen at all.
 */
export function moodFor(phase: Phase, judgement: Judgement | null): Mood {
  if (judgement) return judgement
  switch (phase.kind) {
    case 'lobby':
      return 'idle'
    // A held breath, not a dead screen: the same cool family as `live`, dimmed
    // and drawn in, so the room reads "the music stopped and something is
    // about to happen" without a word. But the round's very first wait has
    // nothing to hold a breath about yet — nobody has heard a note — so it
    // reads as `idle`, the same invitation-to-start colour as the lobby,
    // rather than a tense pause the room did not earn.
    case 'waiting':
      return phase.heardThisRound ? 'hold' : 'idle'
    case 'playing':
      return 'live'
    case 'buzzed':
      return 'buzzed'
    case 'revealed':
      if (phase.outcome === 'correct') return 'correct'
      return phase.outcome === 'allWrong' ? 'wrong' : 'idle'
    case 'finished':
      return 'over'
  }
}

/** What the tier meter should show: a running tier, or nothing at all. */
export interface TierClock {
  tier: Tier | null
  elapsedMs: number
}

/**
 * Where the tier clock stands in a given phase.
 *
 * Written as an exhaustive switch with an annotated return type and no
 * `default`, rather than as `phase.kind === 'playing' || …`: a boolean test
 * would let a new phase fall through to "no tier" with nothing to warn
 * anybody. Here the compiler stops on TS2366 until the new phase says what
 * its clock does.
 *
 * A buzz freezes the tier rather than ending it, so the meter freezes with
 * it — the room can see exactly how much of the tier was left when the music
 * cut. `waiting` shows the same thing from the other side: the tier the host
 * is about to launch, already drained by however much of it was heard.
 */
export function tierClockFor(phase: Phase): TierClock {
  switch (phase.kind) {
    case 'playing':
      return { tier: phase.tier, elapsedMs: phase.elapsedMs }
    case 'waiting':
    case 'buzzed':
      return { tier: phase.launchTier, elapsedMs: phase.resumeAtMs }
    case 'lobby':
    case 'revealed':
    case 'finished':
      return { tier: null, elapsedMs: 0 }
  }
}

/** How much of the current tier has elapsed, as 0…1. */
export function tierProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  return Math.min(1, Math.max(0, elapsedMs / durationMs))
}

export type HeroSizeClass = 'hero-xl' | 'hero-lg' | 'hero-md' | 'hero-sm'

/**
 * Picks a display size from the length of the text, so a short name fills the
 * television and a long song title still fits on it.
 */
export function heroSizeClass(text: string): HeroSizeClass {
  const length = [...text.trim()].length
  if (length <= 5) return 'hero-xl'
  if (length <= 9) return 'hero-lg'
  if (length <= 17) return 'hero-md'
  return 'hero-sm'
}

/** The one line that explains a reveal without anyone having to ask. */
export function revealHeadline(outcome: RevealOutcome, winnerName: string | null): string {
  switch (outcome) {
    case 'correct':
      return winnerName ? `Acertó ${winnerName}` : 'Respuesta correcta'
    case 'allWrong':
      return 'Nadie acertó'
    case 'timeout':
      return 'Nadie pulsó'
    case 'skipped':
      return 'Canción saltada'
  }
}

/**
 * The second line of a reveal: what the round did to the scoreboard.
 *
 * The card alone never explained why the numbers moved. By the time it turns
 * over the room has been arguing for half a minute, the buzz was three
 * judgements ago, and "who just scored" is genuinely lost — so the reveal says
 * it in words instead of leaving the rail to be read backwards.
 */
export function revealDetail(outcome: RevealOutcome, winnerName: string | null): string {
  switch (outcome) {
    // Deliberately no number: what the answer was worth was frozen at the
    // press and is no longer anywhere in the state by the time the card turns
    // over. Naming a figure here would mean carrying one just to print it,
    // and printing the wrong one is worse than printing none.
    case 'correct':
      return winnerName ? `Los puntos son para ${winnerName}` : 'Respuesta correcta'
    case 'allWrong':
      return 'Todos quedaron fuera de esta canción'
    case 'timeout':
      return 'Se acabó el tiempo y nadie pulsó'
    case 'skipped':
      return 'Sin puntos para nadie'
  }
}

/**
 * How the night ended.
 *
 * Kept as data rather than a string so the screen can size a name differently
 * from a list of names, and so the tie case is a fact the compiler carries
 * around instead of a comparison somebody has to remember to make. The
 * television used to crown `scoreboard[0]` even when four people were level,
 * which is a quiet way of being wrong in front of everybody.
 */
export type FinalStanding =
  | { kind: 'nobody' }
  | { kind: 'winner'; name: string; score: number }
  | { kind: 'tie'; names: string[]; score: number }

export function finalStanding(scoreboard: Player[]): FinalStanding {
  const leader = scoreboard[0]
  if (!leader) return { kind: 'nobody' }
  const level = scoreboard.filter((player) => player.score === leader.score)
  if (level.length === 1) return { kind: 'winner', name: leader.name, score: leader.score }
  return { kind: 'tie', names: level.map((player) => player.name), score: leader.score }
}

/** `Ana, Beto y Carla` — a list read the way it would be said out loud. */
export function joinNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
}

export function pointsLabel(score: number): string {
  return `${score} ${Math.abs(score) === 1 ? 'punto' : 'puntos'}`
}

/** The line under the end-of-game hero: who won, or who is level with whom. */
export function finalNote(standing: FinalStanding): string {
  switch (standing.kind) {
    case 'nobody':
      return 'Sin jugadores'
    case 'winner':
      return pointsLabel(standing.score)
    case 'tie':
      return `${joinNames(standing.names)} · ${pointsLabel(standing.score)}`
  }
}

/**
 * What the host's launch button promises.
 *
 * Sounding a tier for the first time and picking a cut one back up are two
 * different acts, and the button has to say which: after a wrong answer the
 * room already heard the first seconds and needs to know the music continues
 * rather than starts over.
 */
export function launchLabel(launchTier: Tier, resumeAtMs: number): string {
  if (resumeAtMs > 0) return 'Retomar donde se cortó'
  return `Sonar ${Math.round(tierDurationMs(launchTier) / 1_000)} segundos`
}

/** The line under the launch button: why the room is standing still. */
export function waitingNote(worthPoints: number): string {
  return worthPoints === 1 ? 'punto en juego ahora' : 'puntos en juego ahora'
}

export function playersConnectedLabel(count: number): string {
  if (count === 0) return 'Esperando jugadores'
  return count === 1 ? '1 jugador conectado' : `${count} jugadores conectados`
}

/**
 * The line under the room code, which **always names the deck about to be
 * played** — including the whole one.
 *
 * That "including" is the entire point and is not cosmetic. "Nueva partida"
 * on the television mints a fresh room and, with it, drops the host's deck
 * choice; if this line only appeared for a themed deck, a host who had just
 * played a themed game would find nothing where something used to be and
 * start a different game without noticing. A line that is always present
 * changes its words instead of vanishing, and a changed word is something a
 * person reads.
 */
export function lobbyNote(playerCount: number, deckLabel: string): string {
  return `${playersConnectedLabel(playerCount)} · Mazo: ${deckLabel}`
}

export function roundLabel(played: number, total: number): string {
  return `Canción ${played} de ${total}`
}
