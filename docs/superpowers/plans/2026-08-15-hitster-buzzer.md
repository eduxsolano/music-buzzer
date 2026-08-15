# Juego de buzzer musical estilo Hitster — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un juego de fiesta presencial donde suena un fragmento de una canción de YouTube y los jugadores compiten por pulsar primero un botón en su celular; quien acierta título y artista se lleva más puntos cuanto antes haya pulsado.

**Architecture:** La página `/host` (laptop conectada al parlante) es la única autoridad: posee el mazo, el reloj de tramos y el marcador, y decide quién pulsó primero por orden de llegada. Los celulares abren `/play` y solo emiten mensajes. El canal entre ambos es Supabase Realtime (broadcast, sin tablas). Todas las reglas viven en un reducer puro sin DOM ni red; YouTube y Supabase quedan detrás de interfaces finas con dobles falsos en los tests.

**Tech Stack:** Next.js 15 (App Router) + TypeScript + Tailwind + Vitest. `@supabase/supabase-js` para tiempo real, `qrcode` para el QR, YouTube IFrame Player API para el audio. Desplegado en Vercel, sin rutas de API.

**Spec:** `docs/superpowers/specs/2026-08-15-hitster-buzzer-design.md`

## Global Constraints

- **Tramos y puntos, valores exactos:** tramo 1 = 5 s → 5 puntos; tramo 2 = 10 s → 3 puntos; tramo 3 = 30 s → 1 punto. Penalización por fallo = −1. Canciones por partida por defecto = 20.
- **Cada tramo reinicia en `startSeconds`**, no continúa donde quedó el anterior. Sin silencio entre tramos.
- **Los límites de tramo son cerrados por abajo y abiertos por arriba:** 4.999 s del tramo 1 vale 5 puntos; 5.000 s ya pertenece al tramo siguiente.
- **El valor se congela en el instante de la pulsación**, no cuando el anfitrión juzga.
- **Un fallo elimina al jugador de esa canción, no de la partida**, y no afecta a los demás. El audio retoma en el punto exacto del corte, dentro del mismo tramo.
- **Los puntos pueden ser negativos.** No hay suelo en cero.
- **El reducer de `src/game/` es puro:** sin DOM, sin red, sin temporizadores propios, sin `Math.random()`, sin `Date.now()`. Toda entropía y todo tiempo entran por eventos.
- **El estado público que viaja a los celulares nunca contiene título, artista, año ni `videoId` de la canción en curso.** Es una regla anti-trampas: el celular tiene DevTools.
- **Idioma:** identificadores y comentarios de código en inglés; textos de interfaz en español.
- **Todo el estado del anfitrión se persiste en `localStorage` en cada cambio**, para sobrevivir a una recarga accidental.

---

### Task 1: Andamiaje del proyecto y módulo de configuración

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx` (vía `create-next-app`)
- Create: `vitest.config.ts`
- Create: `src/game/config.ts`
- Test: `src/game/config.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `TIERS`, `WRONG_ANSWER_PENALTY`, `DEFAULT_ROUNDS` desde `@/game/config`. `npm test` ejecuta Vitest sobre `src/**/*.test.ts`. El alias `@/` apunta a `src/`.

- [ ] **Step 1: Generar el proyecto Next.js**

El directorio ya contiene `.git` y `docs/`, que no entran en conflicto.

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Instalar Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 3: Configurar Vitest**

Crear `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

Añadir a `package.json` en `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Escribir el test de configuración**

Crear `src/game/config.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { DEFAULT_ROUNDS, TIERS, WRONG_ANSWER_PENALTY } from '@/game/config'

describe('config', () => {
  test('define exactly three tiers with the agreed durations and points', () => {
    expect(TIERS).toEqual([
      { tier: 1, durationMs: 5_000, points: 5 },
      { tier: 2, durationMs: 10_000, points: 3 },
      { tier: 3, durationMs: 30_000, points: 1 },
    ])
  })

  test('a wrong answer costs one point', () => {
    expect(WRONG_ANSWER_PENALTY).toBe(1)
  })

  test('a game is twenty songs by default', () => {
    expect(DEFAULT_ROUNDS).toBe(20)
  })
})
```

- [ ] **Step 5: Ejecutar el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/game/config"`

- [ ] **Step 6: Escribir el módulo de configuración**

Crear `src/game/config.ts`:

```typescript
export interface TierConfig {
  tier: 1 | 2 | 3
  durationMs: number
  points: number
}

/** Every tier restarts the song at `startSeconds`; durations are absolute, not cumulative. */
export const TIERS: readonly TierConfig[] = [
  { tier: 1, durationMs: 5_000, points: 5 },
  { tier: 2, durationMs: 10_000, points: 3 },
  { tier: 3, durationMs: 30_000, points: 1 },
] as const

export const WRONG_ANSWER_PENALTY = 1

export const DEFAULT_ROUNDS = 20
```

- [ ] **Step 7: Ejecutar el test y verificar que pasa**

Run: `npm test`
Expected: PASS — 3 tests

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: andamiaje Next.js + Vitest y configuración del juego"
```

---

### Task 2: Lógica de tramos

**Files:**
- Create: `src/game/tiers.ts`
- Test: `src/game/tiers.test.ts`

**Interfaces:**
- Consumes: `TIERS`, `TierConfig` de `@/game/config`.
- Produces: desde `@/game/tiers`: `type Tier = 1 | 2 | 3`, `tierConfig(tier: Tier): TierConfig`, `pointsForTier(tier: Tier): number`, `tierDurationMs(tier: Tier): number`, `nextTier(tier: Tier): Tier | null`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/game/tiers.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { nextTier, pointsForTier, tierDurationMs } from '@/game/tiers'

describe('tiers', () => {
  test('points shrink as the tier grows', () => {
    expect(pointsForTier(1)).toBe(5)
    expect(pointsForTier(2)).toBe(3)
    expect(pointsForTier(3)).toBe(1)
  })

  test('durations are absolute, measured from the song start point', () => {
    expect(tierDurationMs(1)).toBe(5_000)
    expect(tierDurationMs(2)).toBe(10_000)
    expect(tierDurationMs(3)).toBe(30_000)
  })

  test('tiers advance one by one', () => {
    expect(nextTier(1)).toBe(2)
    expect(nextTier(2)).toBe(3)
  })

  test('there is nothing after the third tier', () => {
    expect(nextTier(3)).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/game/tiers"`

- [ ] **Step 3: Implementar**

Crear `src/game/tiers.ts`:

```typescript
import { TIERS, type TierConfig } from '@/game/config'

export type Tier = 1 | 2 | 3

export function tierConfig(tier: Tier): TierConfig {
  const found = TIERS.find((t) => t.tier === tier)
  if (!found) throw new Error(`Unknown tier: ${tier}`)
  return found
}

export function pointsForTier(tier: Tier): number {
  return tierConfig(tier).points
}

export function tierDurationMs(tier: Tier): number {
  return tierConfig(tier).durationMs
}

export function nextTier(tier: Tier): Tier | null {
  const index = TIERS.findIndex((t) => t.tier === tier)
  const next = TIERS[index + 1]
  return next ? next.tier : null
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/game/tiers.ts src/game/tiers.test.ts
git commit -m "feat: lógica de tramos y puntos"
```

---

### Task 3: Tipos del juego, partida y avance de tramos

**Files:**
- Create: `src/game/types.ts`
- Create: `src/game/reducer.ts`
- Test: `src/game/reducer.round.test.ts`

**Interfaces:**
- Consumes: `Tier`, `nextTier`, `tierDurationMs` de `@/game/tiers`.
- Produces: desde `@/game/types`: `PlayerId`, `Player`, `Song`, `Phase`, `GameState`, `GameEvent`. Desde `@/game/reducer`: `initialState(): GameState`, `reduce(state: GameState, event: GameEvent): GameState`, `currentSong(state, songs): Song | null`.

**Nota de diseño para quien implemente:** el reducer no baraja ni mide el tiempo. El mazo ya barajado llega dentro del evento `START_GAME`, y el paso del tiempo llega como eventos `TICK` con un delta en milisegundos. Así el motor es determinista y se puede testear sin relojes ni mocks.

- [ ] **Step 1: Escribir los tipos**

Crear `src/game/types.ts`:

```typescript
import type { Tier } from '@/game/tiers'

export type PlayerId = string

export interface Player {
  id: PlayerId
  name: string
  score: number
}

export interface Song {
  id: string
  videoId: string
  title: string
  artist: string
  year: number
  startSeconds: number
}

export type RevealOutcome = 'correct' | 'allWrong' | 'timeout' | 'skipped'

export type Phase =
  | { kind: 'lobby' }
  | { kind: 'playing'; tier: Tier; elapsedMs: number }
  | { kind: 'buzzed'; tier: Tier; elapsedMs: number; playerId: PlayerId }
  | { kind: 'revealed'; outcome: RevealOutcome; winnerId: PlayerId | null }
  | { kind: 'finished' }

export interface GameState {
  players: Player[]
  /** Song ids not yet played, already shuffled. */
  deck: string[]
  currentSongId: string | null
  roundsPlayed: number
  roundsTotal: number
  /** Players eliminated from the CURRENT song only. Cleared on every new round. */
  lockedOut: PlayerId[]
  phase: Phase
}

export type GameEvent =
  | { type: 'JOIN'; playerId: PlayerId; name: string }
  | { type: 'START_GAME'; deck: string[]; roundsTotal: number }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'BUZZ'; playerId: PlayerId }
  | { type: 'JUDGE'; correct: boolean }
  | { type: 'SKIP_SONG' }
  | { type: 'NEXT_ROUND' }
```

- [ ] **Step 2: Escribir los tests que fallan**

Crear `src/game/reducer.round.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

function withPlayers(...names: string[]): GameState {
  return names.reduce(
    (state, name) => reduce(state, { type: 'JOIN', playerId: name, name }),
    initialState(),
  )
}

describe('joining', () => {
  test('a new player starts at zero points', () => {
    const state = withPlayers('ana')
    expect(state.players).toEqual([{ id: 'ana', name: 'ana', score: 0 }])
  })

  test('rejoining with the same id updates the name instead of duplicating', () => {
    const state = reduce(withPlayers('ana'), { type: 'JOIN', playerId: 'ana', name: 'Ana' })
    expect(state.players).toEqual([{ id: 'ana', name: 'Ana', score: 0 }])
  })

  test('rejoining never resets the score', () => {
    const scored: GameState = {
      ...withPlayers('ana'),
      players: [{ id: 'ana', name: 'ana', score: 7 }],
    }
    const state = reduce(scored, { type: 'JOIN', playerId: 'ana', name: 'Ana' })
    expect(state.players[0].score).toBe(7)
  })
})

describe('starting a game', () => {
  test('deals the first song and starts the first tier', () => {
    const state = reduce(withPlayers('ana'), {
      type: 'START_GAME',
      deck: ['s1', 's2'],
      roundsTotal: 2,
    })
    expect(state.currentSongId).toBe('s1')
    expect(state.deck).toEqual(['s2'])
    expect(state.roundsPlayed).toBe(1)
    expect(state.phase).toEqual({ kind: 'playing', tier: 1, elapsedMs: 0 })
  })
})

describe('tier progression', () => {
  function playing(): GameState {
    return reduce(withPlayers('ana'), { type: 'START_GAME', deck: ['s1'], roundsTotal: 1 })
  }

  test('a tick advances the elapsed time within the tier', () => {
    const state = reduce(playing(), { type: 'TICK', deltaMs: 1_200 })
    expect(state.phase).toEqual({ kind: 'playing', tier: 1, elapsedMs: 1_200 })
  })

  test('reaching the tier duration restarts the song on the next tier', () => {
    const state = reduce(playing(), { type: 'TICK', deltaMs: 5_000 })
    expect(state.phase).toEqual({ kind: 'playing', tier: 2, elapsedMs: 0 })
  })

  test('the third tier running out reveals the song with nobody scoring', () => {
    let state = reduce(playing(), { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'TICK', deltaMs: 10_000 })
    expect(state.phase).toMatchObject({ kind: 'playing', tier: 3 })
    state = reduce(state, { type: 'TICK', deltaMs: 30_000 })
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'timeout', winnerId: null })
    expect(state.players[0].score).toBe(0)
  })

  test('ticks are ignored while nothing is playing', () => {
    const lobby = withPlayers('ana')
    expect(reduce(lobby, { type: 'TICK', deltaMs: 1_000 })).toBe(lobby)
  })
})
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/game/reducer"`

- [ ] **Step 4: Implementar el reducer (partida y tramos)**

Crear `src/game/reducer.ts`:

```typescript
import { DEFAULT_ROUNDS } from '@/game/config'
import { nextTier, tierDurationMs } from '@/game/tiers'
import type { GameEvent, GameState, Song } from '@/game/types'

export function initialState(): GameState {
  return {
    players: [],
    deck: [],
    currentSongId: null,
    roundsPlayed: 0,
    roundsTotal: DEFAULT_ROUNDS,
    lockedOut: [],
    phase: { kind: 'lobby' },
  }
}

/** Deals the next song. Assumes the deck is non-empty. */
function dealRound(state: GameState): GameState {
  const [songId, ...rest] = state.deck
  return {
    ...state,
    deck: rest,
    currentSongId: songId,
    roundsPlayed: state.roundsPlayed + 1,
    lockedOut: [],
    phase: { kind: 'playing', tier: 1, elapsedMs: 0 },
  }
}

export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'JOIN': {
      const existing = state.players.find((p) => p.id === event.playerId)
      if (existing) {
        return {
          ...state,
          players: state.players.map((p) =>
            p.id === event.playerId ? { ...p, name: event.name } : p,
          ),
        }
      }
      return {
        ...state,
        players: [...state.players, { id: event.playerId, name: event.name, score: 0 }],
      }
    }

    case 'START_GAME': {
      return dealRound({
        ...state,
        deck: event.deck,
        roundsTotal: event.roundsTotal,
        roundsPlayed: 0,
      })
    }

    case 'TICK': {
      if (state.phase.kind !== 'playing') return state
      const elapsedMs = state.phase.elapsedMs + event.deltaMs
      if (elapsedMs < tierDurationMs(state.phase.tier)) {
        return { ...state, phase: { ...state.phase, elapsedMs } }
      }
      const upcoming = nextTier(state.phase.tier)
      if (upcoming === null) {
        return { ...state, phase: { kind: 'revealed', outcome: 'timeout', winnerId: null } }
      }
      return { ...state, phase: { kind: 'playing', tier: upcoming, elapsedMs: 0 } }
    }

    default:
      return state
  }
}

export function currentSong(state: GameState, songs: Song[]): Song | null {
  if (!state.currentSongId) return null
  return songs.find((s) => s.id === state.currentSongId) ?? null
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — todos los tests de `reducer.round.test.ts` en verde

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/reducer.ts src/game/reducer.round.test.ts
git commit -m "feat: motor de juego con avance de tramos"
```

---

### Task 4: Pulsación, juicio y eliminación

**Files:**
- Modify: `src/game/reducer.ts` (añadir los casos `BUZZ` y `JUDGE`)
- Test: `src/game/reducer.buzz.test.ts`

**Interfaces:**
- Consumes: `reduce`, `initialState` de `@/game/reducer`; `pointsForTier` de `@/game/tiers`; `WRONG_ANSWER_PENALTY` de `@/game/config`.
- Produces: nada nuevo hacia fuera; extiende el comportamiento de `reduce`.

**Nota de diseño:** aquí está la regla más fácil de romper. Al pulsar, el tramo y el tiempo transcurrido se **copian** dentro de la fase `buzzed`. El juicio lee esa copia congelada, nunca vuelve a mirar el reloj.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/game/reducer.buzz.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

function gameWith(names: string[]): GameState {
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
  test('freezes the tier and the elapsed time at the moment of the press', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 4_999 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    expect(state.phase).toEqual({ kind: 'buzzed', tier: 1, elapsedMs: 4_999, playerId: 'ana' })
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
    state = reduce(state, { type: 'TICK', deltaMs: 60_000 }) // el anfitrión se toma su tiempo
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(5)
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'correct', winnerId: 'ana' })
  })

  test('pressing just past the boundary is worth the next tier down', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 }) // entra al tramo 2
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(3)
  })

  test('the third tier is worth one point', () => {
    let state = gameWith(['ana'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'TICK', deltaMs: 10_000 })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    expect(scoreOf(state, 'ana')).toBe(1)
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
    state = reduce(state, { type: 'NEXT_ROUND' })
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(scoreOf(state, 'ana')).toBe(-2)
  })

  test('the audio resumes at the exact cut point, in the same tier', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'TICK', deltaMs: 5_000 })
    state = reduce(state, { type: 'TICK', deltaMs: 3_000 }) // tramo 2, 3 s dentro
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(state.phase).toEqual({ kind: 'playing', tier: 2, elapsedMs: 3_000 })
  })

  test('an eliminated player is available again on the next song', () => {
    let state = gameWith(['ana', 'beto'])
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.lockedOut).toEqual([])
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — las pulsaciones no cambian la fase (`reduce` devuelve el estado sin tocar)

- [ ] **Step 3: Implementar `BUZZ` y `JUDGE`**

En `src/game/reducer.ts`, ampliar los imports:

```typescript
import { DEFAULT_ROUNDS, WRONG_ANSWER_PENALTY } from '@/game/config'
import { nextTier, pointsForTier, tierDurationMs } from '@/game/tiers'
import type { GameEvent, GameState, Player, PlayerId, Song } from '@/game/types'
```

Añadir el helper justo debajo de `dealRound`:

```typescript
function addScore(players: Player[], playerId: PlayerId, delta: number): Player[] {
  return players.map((p) => (p.id === playerId ? { ...p, score: p.score + delta } : p))
}
```

Y añadir estos dos casos al `switch`, antes de `default`:

```typescript
    case 'BUZZ': {
      if (state.phase.kind !== 'playing') return state
      if (state.lockedOut.includes(event.playerId)) return state
      if (!state.players.some((p) => p.id === event.playerId)) return state
      return {
        ...state,
        phase: {
          kind: 'buzzed',
          tier: state.phase.tier,
          elapsedMs: state.phase.elapsedMs,
          playerId: event.playerId,
        },
      }
    }

    case 'JUDGE': {
      if (state.phase.kind !== 'buzzed') return state
      const { playerId, tier, elapsedMs } = state.phase

      if (event.correct) {
        return {
          ...state,
          players: addScore(state.players, playerId, pointsForTier(tier)),
          phase: { kind: 'revealed', outcome: 'correct', winnerId: playerId },
        }
      }

      const players = addScore(state.players, playerId, -WRONG_ANSWER_PENALTY)
      const lockedOut = [...state.lockedOut, playerId]
      if (lockedOut.length >= players.length) {
        return {
          ...state,
          players,
          lockedOut,
          phase: { kind: 'revealed', outcome: 'allWrong', winnerId: null },
        }
      }
      return { ...state, players, lockedOut, phase: { kind: 'playing', tier, elapsedMs } }
    }
```

- [ ] **Step 4: Ejecutar y verificar el estado**

Run: `npm test`
Expected: los tests de pulsación y juicio pasan; **siguen fallando** los que usan `NEXT_ROUND` (`scores may go negative`, `an eliminated player is available again on the next song`), porque ese evento se implementa en la Task 5. Es lo esperado: no lo implementes aquí.

- [ ] **Step 5: Commit**

```bash
git add src/game/reducer.ts src/game/reducer.buzz.test.ts
git commit -m "feat: pulsación, juicio y eliminación por canción"
```

---

### Task 5: Avance de ronda, salto de canción y fin de partida

**Files:**
- Modify: `src/game/reducer.ts` (añadir los casos `NEXT_ROUND` y `SKIP_SONG`)
- Test: `src/game/reducer.rounds.test.ts`

**Interfaces:**
- Consumes: todo lo anterior de `@/game/reducer`.
- Produces: nada nuevo hacia fuera; completa el comportamiento de `reduce`. Al terminar esta task, `npm test` debe estar **completamente en verde**, incluidos los dos tests de la Task 4 que quedaron pendientes.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/game/reducer.rounds.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import type { GameState } from '@/game/types'

function gameWith(deck: string[], roundsTotal: number): GameState {
  const joined = reduce(initialState(), { type: 'JOIN', playerId: 'ana', name: 'Ana' })
  return reduce(joined, { type: 'START_GAME', deck, roundsTotal })
}

describe('advancing rounds', () => {
  test('deals the next song and resets the tier', () => {
    let state = gameWith(['s1', 's2'], 2)
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: true })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.currentSongId).toBe('s2')
    expect(state.roundsPlayed).toBe(2)
    expect(state.phase).toEqual({ kind: 'playing', tier: 1, elapsedMs: 0 })
  })

  test('no song is dealt twice in one game', () => {
    let state = gameWith(['s1', 's2', 's3'], 3)
    const dealt: string[] = []
    for (let round = 0; round < 3; round += 1) {
      dealt.push(state.currentSongId as string)
      state = reduce(state, { type: 'SKIP_SONG' })
      state = reduce(state, { type: 'NEXT_ROUND' })
    }
    expect(new Set(dealt).size).toBe(3)
  })

  test('advancing is ignored while the song is still playing', () => {
    const state = gameWith(['s1', 's2'], 2)
    expect(reduce(state, { type: 'NEXT_ROUND' })).toBe(state)
  })
})

describe('finishing', () => {
  test('the game ends once the agreed number of songs has been played', () => {
    let state = gameWith(['s1', 's2'], 1)
    state = reduce(state, { type: 'SKIP_SONG' })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.phase).toEqual({ kind: 'finished' })
  })

  test('the game ends early when the deck runs out', () => {
    let state = gameWith(['s1'], 10)
    state = reduce(state, { type: 'SKIP_SONG' })
    state = reduce(state, { type: 'NEXT_ROUND' })
    expect(state.phase).toEqual({ kind: 'finished' })
  })
})

describe('skipping a song', () => {
  test('closes the round with nobody scoring', () => {
    let state = gameWith(['s1', 's2'], 2)
    state = reduce(state, { type: 'SKIP_SONG' })
    expect(state.phase).toEqual({ kind: 'revealed', outcome: 'skipped', winnerId: null })
    expect(state.players[0].score).toBe(0)
  })

  test('works while a player is being judged, in case the video is broken', () => {
    let state = gameWith(['s1', 's2'], 2)
    state = reduce(state, { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'SKIP_SONG' })
    expect(state.phase).toMatchObject({ kind: 'revealed', outcome: 'skipped' })
  })

  test('is ignored once the song is already revealed', () => {
    let state = gameWith(['s1', 's2'], 2)
    state = reduce(state, { type: 'SKIP_SONG' })
    expect(reduce(state, { type: 'SKIP_SONG' })).toBe(state)
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `NEXT_ROUND` y `SKIP_SONG` no hacen nada todavía

- [ ] **Step 3: Implementar `NEXT_ROUND` y `SKIP_SONG`**

Añadir estos dos casos al `switch` de `src/game/reducer.ts`, antes de `default`:

```typescript
    case 'NEXT_ROUND': {
      if (state.phase.kind !== 'revealed') return state
      const gameOver = state.roundsPlayed >= state.roundsTotal || state.deck.length === 0
      if (gameOver) return { ...state, phase: { kind: 'finished' }, currentSongId: null }
      return dealRound(state)
    }

    case 'SKIP_SONG': {
      if (state.phase.kind !== 'playing' && state.phase.kind !== 'buzzed') return state
      return { ...state, phase: { kind: 'revealed', outcome: 'skipped', winnerId: null } }
    }
```

- [ ] **Step 4: Ejecutar y verificar que pasa todo**

Run: `npm test`
Expected: PASS — **toda** la suite en verde, incluidos los dos tests pendientes de `reducer.buzz.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/game/reducer.ts src/game/reducer.rounds.test.ts
git commit -m "feat: avance de ronda, salto de canción y fin de partida"
```

---

### Task 6: Estado público, barajado y código de sala

**Files:**
- Create: `src/game/publicState.ts`
- Create: `src/game/random.ts`
- Test: `src/game/publicState.test.ts`
- Test: `src/game/random.test.ts`

**Interfaces:**
- Consumes: `GameState` de `@/game/types`.
- Produces: desde `@/game/publicState`: `interface PublicState`, `toPublicState(state: GameState): PublicState`. Desde `@/game/random`: `shuffle<T>(items: T[], random: () => number): T[]`, `createRoomCode(random: () => number): string`.

**Nota de diseño:** `toPublicState` es la frontera anti-trampas. Cualquier campo de la canción que se cuele aquí aparece en las DevTools del celular de tus amigos.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/game/publicState.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { initialState, reduce } from '@/game/reducer'
import { toPublicState } from '@/game/publicState'

function playingGame() {
  const joined = reduce(initialState(), { type: 'JOIN', playerId: 'ana', name: 'Ana' })
  return reduce(joined, {
    type: 'START_GAME',
    deck: ['smells-like-teen-spirit'],
    roundsTotal: 1,
  })
}

describe('toPublicState', () => {
  test('never leaks anything about the current song', () => {
    const serialised = JSON.stringify(toPublicState(playingGame()))
    expect(serialised).not.toContain('smells-like-teen-spirit')
    expect(serialised).not.toContain('deck')
    expect(serialised).not.toContain('currentSongId')
  })

  test('carries the scoreboard so a reconnecting phone catches up', () => {
    expect(toPublicState(playingGame()).players).toEqual([
      { id: 'ana', name: 'Ana', score: 0 },
    ])
  })

  test('reports the phase as a plain string', () => {
    expect(toPublicState(playingGame()).phase).toBe('playing')
  })

  test('names who is being judged so their phone can celebrate', () => {
    const state = reduce(playingGame(), { type: 'BUZZ', playerId: 'ana' })
    const pub = toPublicState(state)
    expect(pub.phase).toBe('buzzed')
    expect(pub.buzzedPlayerId).toBe('ana')
  })

  test('reports who is eliminated from the current song', () => {
    let state = reduce(playingGame(), { type: 'BUZZ', playerId: 'ana' })
    state = reduce(state, { type: 'JUDGE', correct: false })
    expect(toPublicState(state).lockedOut).toEqual(['ana'])
  })

  test('reports round progress', () => {
    const pub = toPublicState(playingGame())
    expect(pub.roundsPlayed).toBe(1)
    expect(pub.roundsTotal).toBe(1)
  })
})
```

Crear `src/game/random.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { createRoomCode, shuffle } from '@/game/random'

/** Deterministic stand-in for Math.random, cycling through fixed values. */
function fakeRandom(values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]
}

describe('shuffle', () => {
  test('keeps every item exactly once', () => {
    const result = shuffle(['a', 'b', 'c', 'd'], fakeRandom([0.9, 0.1, 0.5, 0.3]))
    expect([...result].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  test('does not mutate the input', () => {
    const input = ['a', 'b', 'c']
    shuffle(input, fakeRandom([0.5]))
    expect(input).toEqual(['a', 'b', 'c'])
  })

  test('actually reorders when the random source says so', () => {
    expect(shuffle(['a', 'b'], fakeRandom([0.99]))).toEqual(['b', 'a'])
  })
})

describe('createRoomCode', () => {
  test('is four characters long', () => {
    expect(createRoomCode(fakeRandom([0.5]))).toHaveLength(4)
  })

  test('avoids characters that are easy to misread out loud', () => {
    const code = createRoomCode(fakeRandom([0, 0.25, 0.5, 0.75]))
    expect(code).not.toMatch(/[IO01]/)
  })

  test('is uppercase letters only', () => {
    expect(createRoomCode(fakeRandom([0.1, 0.4, 0.7, 0.9]))).toMatch(/^[A-Z]{4}$/)
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/game/publicState"` y `"@/game/random"`

- [ ] **Step 3: Implementar el estado público**

Crear `src/game/publicState.ts`:

```typescript
import type { GameState, Phase, PlayerId } from '@/game/types'

export interface PublicState {
  phase: Phase['kind']
  players: { id: PlayerId; name: string; score: number }[]
  /** Eliminated from the current song only. */
  lockedOut: PlayerId[]
  buzzedPlayerId: PlayerId | null
  roundsPlayed: number
  roundsTotal: number
}

/**
 * Projection sent to the phones. Deliberately omits the deck and the current
 * song: players can open DevTools, so nothing identifying may cross this line.
 */
export function toPublicState(state: GameState): PublicState {
  return {
    phase: state.phase.kind,
    players: state.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
    lockedOut: [...state.lockedOut],
    buzzedPlayerId: state.phase.kind === 'buzzed' ? state.phase.playerId : null,
    roundsPlayed: state.roundsPlayed,
    roundsTotal: state.roundsTotal,
  }
}
```

- [ ] **Step 4: Implementar barajado y código de sala**

Crear `src/game/random.ts`:

```typescript
/** Letters that survive being read aloud in a noisy room: no I/O/0/1 lookalikes. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

const ROOM_CODE_LENGTH = 4

/** Fisher-Yates. The random source is injected so tests stay deterministic. */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function createRoomCode(random: () => number): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)]
  }
  return code
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite en verde

- [ ] **Step 6: Commit**

```bash
git add src/game/publicState.ts src/game/publicState.test.ts src/game/random.ts src/game/random.test.ts
git commit -m "feat: estado público sin filtraciones, barajado y código de sala"
```

---

### Task 7: Lista de canciones y script de validación

**Files:**
- Create: `src/songs/schema.ts`
- Create: `src/songs/songs.json`
- Create: `scripts/check-songs.ts`
- Test: `src/songs/schema.test.ts`
- Modify: `package.json` (script `check-songs`)

**Interfaces:**
- Consumes: `Song` de `@/game/types`.
- Produces: desde `@/songs/schema`: `parseSongs(raw: unknown): Song[]` (lanza `Error` con un mensaje que nombra la entrada culpable). `npm run check-songs` verifica la lista contra YouTube.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/songs/schema.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { parseSongs } from '@/songs/schema'

const valid = {
  id: 'smells-like-teen-spirit',
  videoId: 'hTWKbfoikeg',
  title: 'Smells Like Teen Spirit',
  artist: 'Nirvana',
  year: 1991,
  startSeconds: 42,
}

describe('parseSongs', () => {
  test('accepts a well-formed list', () => {
    expect(parseSongs([valid])).toEqual([valid])
  })

  test('rejects a non-array', () => {
    expect(() => parseSongs({})).toThrow(/array/i)
  })

  test('names the offending entry when a field is missing', () => {
    expect(() => parseSongs([{ ...valid, artist: undefined }])).toThrow(
      /smells-like-teen-spirit.*artist/is,
    )
  })

  test('rejects a videoId that is not eleven characters', () => {
    expect(() => parseSongs([{ ...valid, videoId: 'abc' }])).toThrow(/videoId/i)
  })

  test('rejects a negative start point', () => {
    expect(() => parseSongs([{ ...valid, startSeconds: -1 }])).toThrow(/startSeconds/i)
  })

  test('rejects duplicate ids, which would break round tracking', () => {
    expect(() => parseSongs([valid, valid])).toThrow(/duplicate/i)
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/songs/schema"`

- [ ] **Step 3: Implementar el validador**

Crear `src/songs/schema.ts`:

```typescript
import type { Song } from '@/game/types'

const VIDEO_ID_LENGTH = 11

function fail(id: string, field: string, reason: string): never {
  throw new Error(`Song "${id}": ${field} ${reason}`)
}

function parseSong(raw: unknown, index: number): Song {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Entry ${index} is not an object`)
  }
  const s = raw as Record<string, unknown>
  const id = typeof s.id === 'string' && s.id.length > 0 ? s.id : `#${index}`

  if (typeof s.id !== 'string' || s.id.length === 0) fail(id, 'id', 'must be a non-empty string')
  if (typeof s.videoId !== 'string' || s.videoId.length !== VIDEO_ID_LENGTH) {
    fail(id, 'videoId', `must be a string of ${VIDEO_ID_LENGTH} characters`)
  }
  if (typeof s.title !== 'string' || s.title.length === 0) fail(id, 'title', 'is required')
  if (typeof s.artist !== 'string' || s.artist.length === 0) fail(id, 'artist', 'is required')
  if (typeof s.year !== 'number' || !Number.isInteger(s.year)) {
    fail(id, 'year', 'must be an integer')
  }
  if (typeof s.startSeconds !== 'number' || s.startSeconds < 0) {
    fail(id, 'startSeconds', 'must be a number greater than or equal to zero')
  }

  return {
    id: s.id as string,
    videoId: s.videoId as string,
    title: s.title as string,
    artist: s.artist as string,
    year: s.year as number,
    startSeconds: s.startSeconds as number,
  }
}

export function parseSongs(raw: unknown): Song[] {
  if (!Array.isArray(raw)) throw new Error('The song list must be an array')
  const songs = raw.map(parseSong)

  const seen = new Set<string>()
  for (const song of songs) {
    if (seen.has(song.id)) throw new Error(`Duplicate song id: "${song.id}"`)
    seen.add(song.id)
  }
  return songs
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite en verde

- [ ] **Step 5: Crear la lista inicial de canciones**

Crear `src/songs/songs.json` con estas cinco entradas de arranque. **`startSeconds` es la pieza que decide si el juego engancha: apunta al momento donde la canción se reconoce, no al segundo cero.** Amplía la lista tú mismo antes de la primera partida.

```json
[
  {
    "id": "smells-like-teen-spirit",
    "videoId": "hTWKbfoikeg",
    "title": "Smells Like Teen Spirit",
    "artist": "Nirvana",
    "year": 1991,
    "startSeconds": 0
  },
  {
    "id": "billie-jean",
    "videoId": "Zi_XLOBDo_Y",
    "title": "Billie Jean",
    "artist": "Michael Jackson",
    "year": 1982,
    "startSeconds": 0
  },
  {
    "id": "rolling-in-the-deep",
    "videoId": "rYEDA3JcQqw",
    "title": "Rolling in the Deep",
    "artist": "Adele",
    "year": 2010,
    "startSeconds": 0
  },
  {
    "id": "despacito",
    "videoId": "kJQP7kiw5Fk",
    "title": "Despacito",
    "artist": "Luis Fonsi",
    "year": 2017,
    "startSeconds": 0
  },
  {
    "id": "bohemian-rhapsody",
    "videoId": "fJ9rUzIMcZQ",
    "title": "Bohemian Rhapsody",
    "artist": "Queen",
    "year": 1975,
    "startSeconds": 0
  }
]
```

- [ ] **Step 6: Escribir el script de validación**

Crear `scripts/check-songs.ts`:

```typescript
/**
 * Verifies every song in songs.json before a party, not during one.
 *
 * Always checked: the video exists and allows embedding (YouTube's oEmbed
 * endpoint returns 401/404 otherwise).
 * Only when YOUTUBE_API_KEY is set: the video is long enough for the third
 * tier, i.e. duration > startSeconds + 30.
 *
 * Run with: npm run check-songs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import type { Song } from '../src/game/types'

const LONGEST_TIER_SECONDS = 30

async function isEmbeddable(videoId: string): Promise<boolean> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
  const response = await fetch(url)
  return response.ok
}

/** ISO-8601 duration as returned by the YouTube Data API, e.g. "PT4M33S". */
function isoDurationToSeconds(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!match) return 0
  const [, h, m, s] = match
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
}

async function durationSeconds(videoId: string, apiKey: string): Promise<number | null> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) return null
  const body = (await response.json()) as {
    items?: { contentDetails?: { duration?: string } }[]
  }
  const iso = body.items?.[0]?.contentDetails?.duration
  return iso ? isoDurationToSeconds(iso) : null
}

async function checkSong(song: Song, apiKey: string | undefined): Promise<string[]> {
  const problems: string[] = []

  if (!(await isEmbeddable(song.videoId))) {
    problems.push('video missing, private, or embedding disabled')
  }

  if (apiKey) {
    const seconds = await durationSeconds(song.videoId, apiKey)
    if (seconds === null) {
      problems.push('could not read duration from the YouTube Data API')
    } else if (seconds <= song.startSeconds + LONGEST_TIER_SECONDS) {
      problems.push(
        `too short: ${seconds}s, needs more than ${song.startSeconds + LONGEST_TIER_SECONDS}s`,
      )
    }
  }

  return problems
}

async function main(): Promise<void> {
  const file = path.join(process.cwd(), 'src/songs/songs.json')
  const songs = parseSongs(JSON.parse(readFileSync(file, 'utf8')))

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY not set — skipping duration checks.\n')
  }

  let failures = 0
  for (const song of songs) {
    const problems = await checkSong(song, apiKey)
    if (problems.length === 0) {
      console.log(`ok   ${song.id}`)
    } else {
      failures += 1
      console.error(`FAIL ${song.id}: ${problems.join('; ')}`)
    }
  }

  console.log(`\n${songs.length - failures}/${songs.length} songs usable.`)
  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

Instalar el runner de TypeScript y registrar el script:

```bash
npm install -D tsx
```

Añadir a `package.json` en `"scripts"`:

```json
"check-songs": "tsx scripts/check-songs.ts"
```

- [ ] **Step 7: Ejecutar el validador contra la lista real**

Run: `npm run check-songs`
Expected: las cinco canciones marcadas `ok` y el resumen `5/5 songs usable.` Si alguna falla, sustitúyela por otro `videoId` antes de continuar — ese es justamente el trabajo del script.

- [ ] **Step 8: Commit**

```bash
git add src/songs scripts/check-songs.ts package.json package-lock.json src/songs/schema.test.ts
git commit -m "feat: lista de canciones validada y script check-songs"
```

---

### Task 7b: Importador de playlist de YouTube

**Files:**
- Create: `src/songs/import.ts`
- Create: `scripts/import-playlist.ts`
- Test: `src/songs/import.test.ts`
- Modify: `scripts/check-songs.ts` (marcar entradas sin revisar)
- Modify: `package.json` (script `import-playlist`)

**Interfaces:**
- Consumes: `parseSongs` de `@/songs/schema`; `Song` de `@/game/types`.
- Produces: desde `@/songs/import`: `playlistIdFromInput(input: string): string | null`, `cleanTitle(raw: string): string`, `splitArtistAndTitle(rawTitle: string, channelTitle: string): { artist: string; title: string }`, `slugify(text: string): string`. Comando `npm run import-playlist -- <url-o-id>`.

**Nota de diseño:** el importador rellena `videoId`, `title` y una **conjetura** de `artist`. `year` y `startSeconds` quedan en cero a propósito, y `check-songs` los marca como pendientes: es una lista de tareas, no un fallo. `startSeconds` no se puede automatizar y es el campo que más afecta a la diversión, así que el importador ahorra tecleo, no curaduría.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/songs/import.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { cleanTitle, playlistIdFromInput, slugify, splitArtistAndTitle } from '@/songs/import'

describe('playlistIdFromInput', () => {
  test('reads the id out of a playlist URL', () => {
    expect(playlistIdFromInput('https://www.youtube.com/playlist?list=PL1234abcd')).toBe(
      'PL1234abcd',
    )
  })

  test('reads the id out of a watch URL that carries a playlist', () => {
    expect(playlistIdFromInput('https://youtube.com/watch?v=abc&list=PLxyz')).toBe('PLxyz')
  })

  test('accepts a bare id', () => {
    expect(playlistIdFromInput('PL1234abcd')).toBe('PL1234abcd')
  })

  test('rejects something that is neither', () => {
    expect(playlistIdFromInput('https://youtube.com/watch?v=abc')).toBeNull()
  })
})

describe('cleanTitle', () => {
  test('strips the usual promotional noise', () => {
    expect(cleanTitle('Smells Like Teen Spirit (Official Music Video)')).toBe(
      'Smells Like Teen Spirit',
    )
    expect(cleanTitle('Billie Jean [4K Remastered]')).toBe('Billie Jean')
    expect(cleanTitle('Rolling in the Deep (Official Audio) [HD]')).toBe('Rolling in the Deep')
  })

  test('keeps parentheses that are part of the actual title', () => {
    expect(cleanTitle("(Don't Fear) The Reaper")).toBe("(Don't Fear) The Reaper")
  })

  test('collapses the whitespace left behind', () => {
    expect(cleanTitle('Song  (Official Video)   ')).toBe('Song')
  })
})

describe('splitArtistAndTitle', () => {
  test('splits on the dash convention', () => {
    expect(splitArtistAndTitle('Nirvana - Smells Like Teen Spirit', 'NirvanaVEVO')).toEqual({
      artist: 'Nirvana',
      title: 'Smells Like Teen Spirit',
    })
  })

  test('falls back to the channel when there is no dash', () => {
    expect(splitArtistAndTitle('Smells Like Teen Spirit', 'Nirvana - Topic')).toEqual({
      artist: 'Nirvana',
      title: 'Smells Like Teen Spirit',
    })
  })

  test('never returns an empty artist, which the schema would reject', () => {
    expect(splitArtistAndTitle('Some Song', '').artist).toBe('Desconocido')
  })

  test('keeps dashes that appear later in the title', () => {
    expect(splitArtistAndTitle('Queen - Bohemian Rhapsody - Live Aid', 'QueenVEVO')).toEqual({
      artist: 'Queen',
      title: 'Bohemian Rhapsody - Live Aid',
    })
  })
})

describe('slugify', () => {
  test('makes a url-safe id', () => {
    expect(slugify('Smells Like Teen Spirit')).toBe('smells-like-teen-spirit')
  })

  test('strips accents, so Spanish titles do not produce mojibake ids', () => {
    expect(slugify('Corazón Partío')).toBe('corazon-partio')
  })

  test('collapses punctuation instead of leaving stray dashes', () => {
    expect(slugify('Despacito ft. Daddy Yankee!')).toBe('despacito-ft-daddy-yankee')
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/songs/import"`

- [ ] **Step 3: Implementar los helpers**

Crear `src/songs/import.ts`:

```typescript
/** Bracketed segments that exist only to advertise the upload, not the song. */
const PROMO_NOISE =
  /\s*[([][^()[\]]*(?:official|video|audio|lyrics?|hd|hq|4k|8k|remaster(?:ed)?|mv|visuali[sz]er|full song)[^()[\]]*[)\]]/gi

const UNKNOWN_ARTIST = 'Desconocido'

export function playlistIdFromInput(input: string): string | null {
  const trimmed = input.trim()
  const fromUrl = /[?&]list=([^&]+)/.exec(trimmed)
  if (fromUrl) return fromUrl[1]
  return /^[A-Za-z0-9_-]{2,}$/.test(trimmed) && !trimmed.includes('/') ? trimmed : null
}

export function cleanTitle(raw: string): string {
  return raw.replace(PROMO_NOISE, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * YouTube titles usually read "Artist - Title". When they do not, the channel
 * name is the next best guess ("Nirvana - Topic" is auto-generated by YouTube).
 */
export function splitArtistAndTitle(
  rawTitle: string,
  channelTitle: string,
): { artist: string; title: string } {
  const cleaned = cleanTitle(rawTitle)
  const dash = cleaned.indexOf(' - ')
  if (dash > 0) {
    return {
      artist: cleaned.slice(0, dash).trim(),
      title: cleaned.slice(dash + 3).trim(),
    }
  }
  const channel = channelTitle.replace(/\s*-\s*Topic$/i, '').trim()
  return { artist: channel || UNKNOWN_ARTIST, title: cleaned }
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks left behind by NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite en verde

- [ ] **Step 5: Escribir el importador**

Crear `scripts/import-playlist.ts`:

```typescript
/**
 * Turns a YouTube playlist into songs.json entries.
 *
 * Fills videoId, title and a guessed artist. Leaves year and startSeconds at
 * zero on purpose: check-songs reports them as pending review.
 *
 * Run with: npm run import-playlist -- <playlist url or id>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseSongs } from '../src/songs/schema'
import { playlistIdFromInput, slugify, splitArtistAndTitle } from '../src/songs/import'
import type { Song } from '../src/game/types'

const PAGE_SIZE = 50

interface PlaylistItem {
  snippet?: {
    title?: string
    videoOwnerChannelTitle?: string
    resourceId?: { videoId?: string }
  }
}

async function fetchPlaylistItems(playlistId: string, apiKey: string): Promise<PlaylistItem[]> {
  const items: PlaylistItem[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('playlistId', playlistId)
    url.searchParams.set('maxResults', String(PAGE_SIZE))
    url.searchParams.set('key', apiKey)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`YouTube API ${response.status}: ${await response.text()}`)
    }
    const body = (await response.json()) as { items?: PlaylistItem[]; nextPageToken?: string }
    items.push(...(body.items ?? []))
    pageToken = body.nextPageToken
  } while (pageToken)

  return items
}

function toSong(item: PlaylistItem, takenIds: Set<string>): Song | null {
  const videoId = item.snippet?.resourceId?.videoId
  const rawTitle = item.snippet?.title ?? ''
  if (!videoId) return null
  // YouTube keeps tombstones in playlists for videos that went away.
  if (rawTitle === 'Deleted video' || rawTitle === 'Private video') return null

  const { artist, title } = splitArtistAndTitle(rawTitle, item.snippet?.videoOwnerChannelTitle ?? '')

  let id = slugify(`${artist}-${title}`) || videoId.toLowerCase()
  let suffix = 2
  while (takenIds.has(id)) {
    id = `${slugify(`${artist}-${title}`)}-${suffix}`
    suffix += 1
  }
  takenIds.add(id)

  return { id, videoId, title, artist, year: 0, startSeconds: 0 }
}

async function main(): Promise<void> {
  const input = process.argv[2]
  if (!input) throw new Error('Usage: npm run import-playlist -- <playlist url or id>')

  const playlistId = playlistIdFromInput(input)
  if (!playlistId) throw new Error(`Could not find a playlist id in "${input}"`)

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is required to read a playlist')

  const file = path.join(process.cwd(), 'src/songs/songs.json')
  const existing = parseSongs(JSON.parse(readFileSync(file, 'utf8')))
  const knownVideoIds = new Set(existing.map((s) => s.videoId))
  const takenIds = new Set(existing.map((s) => s.id))

  const items = await fetchPlaylistItems(playlistId, apiKey)
  const added: Song[] = []
  for (const item of items) {
    if (knownVideoIds.has(item.snippet?.resourceId?.videoId ?? '')) continue
    const song = toSong(item, takenIds)
    if (song) added.push(song)
  }

  const merged = [...existing, ...added]
  parseSongs(merged) // fail loudly rather than write a broken file
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`)

  console.log(`${items.length} items in the playlist, ${added.length} new songs added.`)
  console.log(`${merged.length} songs total. Now fill in year and startSeconds:`)
  for (const song of added) console.log(`  ${song.id} — ${song.artist} · ${song.title}`)
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
```

Añadir a `package.json` en `"scripts"`:

```json
"import-playlist": "tsx scripts/import-playlist.ts"
```

- [ ] **Step 6: Marcar en check-songs lo que falta por revisar**

En `scripts/check-songs.ts`, dentro de `checkSong`, añadir estas comprobaciones justo antes del `return problems`:

```typescript
  if (song.year === 0) {
    problems.push('year not filled in yet (imported songs start at 0)')
  }
  if (song.startSeconds === 0) {
    problems.push('startSeconds still 0 — pick the moment the song becomes recognisable')
  }
```

Esto convierte a `check-songs` en la lista de tareas post-importación: falla hasta que cada canción esté lista para una fiesta.

**Consecuencia sobre `songs.json` de la Task 7:** las cinco canciones de arranque tienen `startSeconds: 0` y ahora fallarían. Ajusta cada una a un punto reconocible antes de continuar; por ejemplo `smells-like-teen-spirit: 20`, `billie-jean: 30`, `rolling-in-the-deep: 15`, `despacito: 42`, `bohemian-rhapsody: 175`. Verifica cada uno con el oído, no de memoria.

- [ ] **Step 7: Probar el importador con una playlist real**

Obtener una clave en Google Cloud Console (habilitar *YouTube Data API v3*) y exportarla:

```bash
export YOUTUBE_API_KEY=...
npm run import-playlist -- "https://www.youtube.com/playlist?list=TU_PLAYLIST"
npm run check-songs
```

Expected: el importador lista las canciones añadidas; `check-songs` falla nombrando exactamente las que necesitan `year` y `startSeconds`. Rellenarlas y volver a ejecutar hasta que pase.

- [ ] **Step 8: Commit**

```bash
git add src/songs/import.ts src/songs/import.test.ts scripts/import-playlist.ts scripts/check-songs.ts package.json src/songs/songs.json
git commit -m "feat: importar el mazo desde una playlist de YouTube"
```

---

### Task 8: Protocolo de mensajes y canal de tiempo real

**Files:**
- Create: `src/realtime/messages.ts`
- Create: `src/realtime/channel.ts`
- Create: `src/realtime/supabaseChannel.ts`
- Test: `src/realtime/messages.test.ts`
- Test: `src/realtime/channel.test.ts`
- Modify: `.env.local.example` (crear)

**Interfaces:**
- Consumes: `PublicState` de `@/game/publicState`.
- Produces: desde `@/realtime/messages`: `type HostMessage`, `type PlayerMessage`, `parseHostMessage(raw: unknown): HostMessage | null`, `parsePlayerMessage(raw: unknown): PlayerMessage | null`. Desde `@/realtime/channel`: `interface Channel`, `class FakeChannel implements Channel`. Desde `@/realtime/supabaseChannel`: `createSupabaseChannel(room: string): Channel`.

**Nota de diseño:** los mensajes entran desde internet, así que se validan en runtime. Un mensaje inválido se descarta en silencio (`null`), nunca revienta la partida.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/realtime/messages.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { parseHostMessage, parsePlayerMessage } from '@/realtime/messages'

describe('parsePlayerMessage', () => {
  test('accepts a join', () => {
    expect(parsePlayerMessage({ type: 'JOIN', playerId: 'p1', name: 'Ana' })).toEqual({
      type: 'JOIN',
      playerId: 'p1',
      name: 'Ana',
    })
  })

  test('accepts a buzz', () => {
    expect(parsePlayerMessage({ type: 'BUZZ', playerId: 'p1' })).toEqual({
      type: 'BUZZ',
      playerId: 'p1',
    })
  })

  test('rejects garbage instead of throwing', () => {
    expect(parsePlayerMessage(null)).toBeNull()
    expect(parsePlayerMessage('BUZZ')).toBeNull()
    expect(parsePlayerMessage({ type: 'BUZZ' })).toBeNull()
    expect(parsePlayerMessage({ type: 'NUKE', playerId: 'p1' })).toBeNull()
  })

  test('rejects a join with an empty name', () => {
    expect(parsePlayerMessage({ type: 'JOIN', playerId: 'p1', name: '' })).toBeNull()
  })
})

describe('parseHostMessage', () => {
  const state = {
    phase: 'playing' as const,
    players: [],
    lockedOut: [],
    buzzedPlayerId: null,
    roundsPlayed: 1,
    roundsTotal: 20,
  }

  test('accepts a state broadcast', () => {
    expect(parseHostMessage({ type: 'STATE', state })).toEqual({ type: 'STATE', state })
  })

  test('accepts a buzz acknowledgement', () => {
    expect(parseHostMessage({ type: 'BUZZ_ACCEPTED', playerId: 'p1' })).toEqual({
      type: 'BUZZ_ACCEPTED',
      playerId: 'p1',
    })
  })

  test('rejects garbage instead of throwing', () => {
    expect(parseHostMessage({ type: 'STATE' })).toBeNull()
    expect(parseHostMessage(undefined)).toBeNull()
  })
})
```

Crear `src/realtime/channel.test.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest'
import { FakeChannel } from '@/realtime/channel'

describe('FakeChannel', () => {
  test('delivers published messages to subscribers', async () => {
    const channel = new FakeChannel()
    const received: unknown[] = []
    await channel.subscribe((message) => received.push(message))
    await channel.publish({ type: 'BUZZ', playerId: 'p1' })
    expect(received).toEqual([{ type: 'BUZZ', playerId: 'p1' }])
  })

  test('records everything published, so tests can assert on traffic', async () => {
    const channel = new FakeChannel()
    await channel.publish({ type: 'BUZZ', playerId: 'p1' })
    expect(channel.published).toEqual([{ type: 'BUZZ', playerId: 'p1' }])
  })

  test('stops delivering once closed', async () => {
    const channel = new FakeChannel()
    const handler = vi.fn()
    await channel.subscribe(handler)
    await channel.close()
    await channel.publish({ type: 'BUZZ', playerId: 'p1' })
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/realtime/messages"` y `"@/realtime/channel"`

- [ ] **Step 3: Implementar el protocolo**

Crear `src/realtime/messages.ts`:

```typescript
import type { PublicState } from '@/game/publicState'

export type HostMessage =
  | { type: 'STATE'; state: PublicState }
  | { type: 'BUZZ_ACCEPTED'; playerId: string }

export type PlayerMessage =
  | { type: 'JOIN'; playerId: string; name: string }
  | { type: 'BUZZ'; playerId: string }

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function parsePlayerMessage(raw: unknown): PlayerMessage | null {
  const message = asRecord(raw)
  if (!message || !nonEmptyString(message.playerId)) return null

  if (message.type === 'JOIN' && nonEmptyString(message.name)) {
    return { type: 'JOIN', playerId: message.playerId, name: message.name }
  }
  if (message.type === 'BUZZ') {
    return { type: 'BUZZ', playerId: message.playerId }
  }
  return null
}

export function parseHostMessage(raw: unknown): HostMessage | null {
  const message = asRecord(raw)
  if (!message) return null

  if (message.type === 'STATE' && asRecord(message.state)) {
    return { type: 'STATE', state: message.state as PublicState }
  }
  if (message.type === 'BUZZ_ACCEPTED' && nonEmptyString(message.playerId)) {
    return { type: 'BUZZ_ACCEPTED', playerId: message.playerId }
  }
  return null
}
```

- [ ] **Step 4: Implementar la interfaz de canal y el doble falso**

Crear `src/realtime/channel.ts`:

```typescript
export type MessageHandler = (message: unknown) => void

/** The whole surface the game needs from a realtime provider. */
export interface Channel {
  publish(message: unknown): Promise<void>
  subscribe(handler: MessageHandler): Promise<void>
  close(): Promise<void>
}

/** In-memory channel for tests: no network, fully synchronous delivery. */
export class FakeChannel implements Channel {
  readonly published: unknown[] = []
  private handlers: MessageHandler[] = []
  private closed = false

  async publish(message: unknown): Promise<void> {
    if (this.closed) return
    this.published.push(message)
    for (const handler of this.handlers) handler(message)
  }

  async subscribe(handler: MessageHandler): Promise<void> {
    this.handlers.push(handler)
  }

  async close(): Promise<void> {
    this.closed = true
    this.handlers = []
  }
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite en verde

- [ ] **Step 6: Implementar el canal de Supabase**

```bash
npm install @supabase/supabase-js
```

Crear `src/realtime/supabaseChannel.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Channel, MessageHandler } from '@/realtime/channel'

const EVENT = 'game'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } })
}

/**
 * Broadcast-only channel. No tables, no RLS: messages are relayed and forgotten.
 * `self: false` keeps a sender from receiving its own messages back.
 */
export function createSupabaseChannel(room: string): Channel {
  const channel = client().channel(`sala:${room}`, {
    config: { broadcast: { self: false } },
  })

  return {
    async publish(message: unknown): Promise<void> {
      await channel.send({ type: 'broadcast', event: EVENT, payload: message })
    },

    async subscribe(handler: MessageHandler): Promise<void> {
      channel.on('broadcast', { event: EVENT }, ({ payload }) => handler(payload))
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve()
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Supabase channel failed: ${status}`))
          }
        })
      })
    },

    async close(): Promise<void> {
      await channel.unsubscribe()
    },
  }
}
```

Crear `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Crear un proyecto en supabase.com, copiar URL y clave anónima a un `.env.local` local (no versionado). No hace falta crear tablas ni tocar RLS: solo se usan canales broadcast.

- [ ] **Step 7: Commit**

```bash
git add src/realtime .env.local.example package.json package-lock.json
git commit -m "feat: protocolo de mensajes y canal Supabase Realtime"
```

---

### Task 9: Reproductor de audio con doble búfer de YouTube

**Files:**
- Create: `src/audio/audioPlayer.ts`
- Create: `src/audio/youtubePlayer.ts`
- Test: `src/audio/youtubePlayer.test.ts`

**Interfaces:**
- Consumes: nada del juego.
- Produces: desde `@/audio/audioPlayer`: `interface AudioPlayer`. Desde `@/audio/youtubePlayer`: `interface YouTubePlayer`, `type PlayerFactory`, `createDoubleBufferedPlayer(factory: PlayerFactory): AudioPlayer`.

**Nota de diseño:** el motor lleva su propio reloj y el reproductor solo obedece. La deriva entre el reloj del motor y el de YouTube en 30 segundos es de milisegundos, y como la puntuación usa siempre el reloj del motor, es idéntica para todos los jugadores. El doble búfer existe para un motivo concreto: sin él hay uno o dos segundos de silencio mientras YouTube carga la canción siguiente, y eso corta el ritmo de la fiesta.

- [ ] **Step 1: Escribir la interfaz**

Crear `src/audio/audioPlayer.ts`:

```typescript
export interface AudioPlayer {
  /** Buffers a song silently so the next `play` starts instantly. */
  preload(videoId: string, startSeconds: number): Promise<void>
  /** Seeks to `startSeconds` and plays. Restarting a tier calls this again. */
  play(videoId: string, startSeconds: number): Promise<void>
  pause(): void
  resume(): void
  stop(): void
}
```

- [ ] **Step 2: Escribir los tests que fallan**

Crear `src/audio/youtubePlayer.test.ts`:

```typescript
import { beforeEach, describe, expect, test } from 'vitest'
import { createDoubleBufferedPlayer, type YouTubePlayer } from '@/audio/youtubePlayer'

class SpyPlayer implements YouTubePlayer {
  readonly calls: string[] = []
  loadedVideoId: string | null = null

  load(videoId: string, startSeconds: number): void {
    this.loadedVideoId = videoId
    this.calls.push(`load:${videoId}@${startSeconds}`)
  }
  seekTo(seconds: number): void {
    this.calls.push(`seek:${seconds}`)
  }
  play(): void {
    this.calls.push('play')
  }
  pause(): void {
    this.calls.push('pause')
  }
  mute(): void {
    this.calls.push('mute')
  }
  unMute(): void {
    this.calls.push('unmute')
  }
}

describe('double-buffered player', () => {
  let a: SpyPlayer
  let b: SpyPlayer

  beforeEach(() => {
    a = new SpyPlayer()
    b = new SpyPlayer()
  })

  function player() {
    return createDoubleBufferedPlayer(() => [a, b])
  }

  test('preloading buffers silently: muted, played, then paused', async () => {
    await player().preload('vid1', 10)
    expect(a.calls).toEqual(['mute', 'load:vid1@10', 'play', 'pause', 'seek:10'])
  })

  test('playing a preloaded song reuses that buffer instead of reloading', async () => {
    const p = player()
    await p.preload('vid1', 10)
    a.calls.length = 0
    await p.play('vid1', 10)
    expect(a.calls).toEqual(['unmute', 'seek:10', 'play'])
    expect(a.calls).not.toContain('load:vid1@10')
  })

  test('playing an unbuffered song loads it on the spot', async () => {
    await player().play('surprise', 0)
    expect(a.calls).toEqual(['unmute', 'load:surprise@0', 'seek:0', 'play'])
  })

  test('the next song preloads into the other buffer while one is active', async () => {
    const p = player()
    await p.play('vid1', 0)
    await p.preload('vid2', 5)
    expect(b.loadedVideoId).toBe('vid2')
    expect(a.loadedVideoId).toBe('vid1')
  })

  test('replaying the active song restarts it from the start point', async () => {
    const p = player()
    await p.play('vid1', 12)
    a.calls.length = 0
    await p.play('vid1', 12) // el tramo siguiente reinicia la canción
    expect(a.calls).toEqual(['unmute', 'seek:12', 'play'])
  })

  test('pause and resume act on the active buffer only', async () => {
    const p = player()
    await p.play('vid1', 0)
    a.calls.length = 0
    p.pause()
    p.resume()
    expect(a.calls).toEqual(['pause', 'play'])
    expect(b.calls).toEqual([])
  })

  test('stop pauses the active buffer', async () => {
    const p = player()
    await p.play('vid1', 0)
    a.calls.length = 0
    p.stop()
    expect(a.calls).toEqual(['pause'])
  })
})
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/audio/youtubePlayer"`

- [ ] **Step 4: Implementar el doble búfer**

Crear `src/audio/youtubePlayer.ts`:

```typescript
import type { AudioPlayer } from '@/audio/audioPlayer'

/** The slice of the YouTube IFrame API this game needs. */
export interface YouTubePlayer {
  load(videoId: string, startSeconds: number): void
  seekTo(seconds: number): void
  play(): void
  pause(): void
  mute(): void
  unMute(): void
}

export type PlayerFactory = () => [YouTubePlayer, YouTubePlayer]

interface Buffer {
  player: YouTubePlayer
  videoId: string | null
}

/**
 * Two players taking turns: one sounds while the other silently buffers the
 * next song. Without this there is a dead second or two between songs.
 */
export function createDoubleBufferedPlayer(factory: PlayerFactory): AudioPlayer {
  const [first, second] = factory()
  const buffers: [Buffer, Buffer] = [
    { player: first, videoId: null },
    { player: second, videoId: null },
  ]
  let activeIndex = 0

  const active = () => buffers[activeIndex]
  const idle = () => buffers[activeIndex === 0 ? 1 : 0]

  return {
    async preload(videoId: string, startSeconds: number): Promise<void> {
      const buffer = active().videoId === null ? active() : idle()
      buffer.player.mute()
      buffer.player.load(videoId, startSeconds)
      buffer.player.play()
      buffer.player.pause()
      buffer.player.seekTo(startSeconds)
      buffer.videoId = videoId
    },

    async play(videoId: string, startSeconds: number): Promise<void> {
      if (active().videoId !== videoId && idle().videoId === videoId) {
        activeIndex = activeIndex === 0 ? 1 : 0
      }
      const buffer = active()
      buffer.player.unMute()
      if (buffer.videoId !== videoId) {
        buffer.player.load(videoId, startSeconds)
        buffer.videoId = videoId
      }
      buffer.player.seekTo(startSeconds)
      buffer.player.play()
    },

    pause(): void {
      active().player.pause()
    },

    resume(): void {
      active().player.play()
    },

    stop(): void {
      active().player.pause()
    },
  }
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite en verde

- [ ] **Step 6: Commit**

```bash
git add src/audio
git commit -m "feat: reproductor de audio con doble búfer de YouTube"
```

---

### Task 10: Iframes reales de YouTube

**Files:**
- Create: `src/audio/youtubeIframes.tsx`
- Modify: ninguno

**Interfaces:**
- Consumes: `YouTubePlayer`, `createDoubleBufferedPlayer` de `@/audio/youtubePlayer`; `AudioPlayer` de `@/audio/audioPlayer`.
- Produces: desde `@/audio/youtubeIframes`: componente `<YouTubeStage onReady={(player: AudioPlayer) => void} />`.

**Nota:** esta pieza toca la API global de YouTube y no se testea automáticamente; se verifica en la prueba de humo de la Task 14. Su lógica interesante ya está cubierta en la Task 9.

- [ ] **Step 1: Escribir el componente**

Crear `src/audio/youtubeIframes.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import type { AudioPlayer } from '@/audio/audioPlayer'
import { createDoubleBufferedPlayer, type YouTubePlayer } from '@/audio/youtubePlayer'

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement, options: Record<string, unknown>) => YtApiPlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface YtApiPlayer {
  loadVideoById(options: { videoId: string; startSeconds: number }): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  mute(): void
  unMute(): void
}

function loadIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  return new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
}

function createApiPlayer(element: HTMLElement): Promise<YtApiPlayer> {
  return new Promise((resolve) => {
    const player = new window.YT!.Player(element, {
      height: '1',
      width: '1',
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
      events: { onReady: () => resolve(player) },
    })
  })
}

function adapt(player: YtApiPlayer): YouTubePlayer {
  return {
    load: (videoId, startSeconds) => player.loadVideoById({ videoId, startSeconds }),
    seekTo: (seconds) => player.seekTo(seconds, true),
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    mute: () => player.mute(),
    unMute: () => player.unMute(),
  }
}

/**
 * Mounts the two hidden iframes the double buffer drives and hands the ready
 * AudioPlayer back to the host page.
 */
export function YouTubeStage({ onReady }: { onReady: (player: AudioPlayer) => void }) {
  const slotA = useRef<HTMLDivElement>(null)
  const slotB = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false
    void (async () => {
      await loadIframeApi()
      if (cancelled || !slotA.current || !slotB.current) return
      const a = adapt(await createApiPlayer(slotA.current))
      const b = adapt(await createApiPlayer(slotB.current))
      if (cancelled) return
      onReady(createDoubleBufferedPlayer(() => [a, b]))
    })()

    return () => {
      cancelled = true
    }
  }, [onReady])

  return (
    <div aria-hidden className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
      <div ref={slotA} />
      <div ref={slotB} />
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 3: Commit**

```bash
git add src/audio/youtubeIframes.tsx
git commit -m "feat: iframes ocultos de YouTube para el doble búfer"
```

---

### Task 11: Pantalla del jugador

**Files:**
- Create: `src/play/playerIdentity.ts`
- Create: `src/app/play/page.tsx`
- Test: `src/play/playerIdentity.test.ts`

**Interfaces:**
- Consumes: `createSupabaseChannel` de `@/realtime/supabaseChannel`; `parseHostMessage` de `@/realtime/messages`; `PublicState` de `@/game/publicState`.
- Produces: desde `@/play/playerIdentity`: `loadIdentity(storage: Storage): { playerId: string; name: string | null }`, `saveName(storage: Storage, name: string): void`, `buttonState(state: PublicState | null, playerId: string): 'waiting' | 'armed' | 'locked' | 'eliminated'`. Ruta `/play?sala=CODE`.

**Nota de diseño:** `buttonState` es la única lógica no trivial de esta pantalla, así que se extrae del componente y se testea. El resto es renderizado.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/play/playerIdentity.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { buttonState, loadIdentity, saveName } from '@/play/playerIdentity'
import type { PublicState } from '@/game/publicState'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

function stateWith(overrides: Partial<PublicState>): PublicState {
  return {
    phase: 'playing',
    players: [{ id: 'p1', name: 'Ana', score: 0 }],
    lockedOut: [],
    buzzedPlayerId: null,
    roundsPlayed: 1,
    roundsTotal: 20,
    ...overrides,
  }
}

describe('identity', () => {
  test('mints an id on first use and keeps it afterwards', () => {
    const storage = new MemoryStorage()
    const first = loadIdentity(storage)
    expect(first.playerId).toMatch(/\S/)
    expect(first.name).toBeNull()
    expect(loadIdentity(storage).playerId).toBe(first.playerId)
  })

  test('remembers the name across reloads, so a sleeping phone comes back whole', () => {
    const storage = new MemoryStorage()
    loadIdentity(storage)
    saveName(storage, 'Ana')
    expect(loadIdentity(storage).name).toBe('Ana')
  })
})

describe('buttonState', () => {
  test('waits until the host has sent anything', () => {
    expect(buttonState(null, 'p1')).toBe('waiting')
  })

  test('is armed while the song is playing', () => {
    expect(buttonState(stateWith({ phase: 'playing' }), 'p1')).toBe('armed')
  })

  test('is locked while somebody is being judged', () => {
    expect(buttonState(stateWith({ phase: 'buzzed', buzzedPlayerId: 'p2' }), 'p1')).toBe('locked')
  })

  test('shows elimination even while the song keeps playing for the others', () => {
    expect(buttonState(stateWith({ phase: 'playing', lockedOut: ['p1'] }), 'p1')).toBe(
      'eliminated',
    )
  })

  test('is locked in the lobby, between songs and at the end', () => {
    expect(buttonState(stateWith({ phase: 'lobby' }), 'p1')).toBe('locked')
    expect(buttonState(stateWith({ phase: 'revealed' }), 'p1')).toBe('locked')
    expect(buttonState(stateWith({ phase: 'finished' }), 'p1')).toBe('locked')
  })

  test('elimination clears when the next song starts', () => {
    expect(buttonState(stateWith({ phase: 'playing', lockedOut: [] }), 'p1')).toBe('armed')
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/play/playerIdentity"`

- [ ] **Step 3: Implementar identidad y estado del botón**

Crear `src/play/playerIdentity.ts`:

```typescript
import type { PublicState } from '@/game/publicState'

const ID_KEY = 'hitster:playerId'
const NAME_KEY = 'hitster:playerName'

export type ButtonState = 'waiting' | 'armed' | 'locked' | 'eliminated'

/**
 * A stable id survives the phone going to sleep, changing network, or the tab
 * reloading: the player comes back with their name and score intact.
 */
export function loadIdentity(storage: Storage): { playerId: string; name: string | null } {
  let playerId = storage.getItem(ID_KEY)
  if (!playerId) {
    playerId = crypto.randomUUID()
    storage.setItem(ID_KEY, playerId)
  }
  return { playerId, name: storage.getItem(NAME_KEY) }
}

export function saveName(storage: Storage, name: string): void {
  storage.setItem(NAME_KEY, name)
}

export function buttonState(state: PublicState | null, playerId: string): ButtonState {
  if (!state) return 'waiting'
  if (state.lockedOut.includes(playerId)) return 'eliminated'
  return state.phase === 'playing' ? 'armed' : 'locked'
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite en verde

- [ ] **Step 5: Escribir la pantalla del jugador**

Crear `src/app/play/page.tsx`:

```tsx
'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { PublicState } from '@/game/publicState'
import { parseHostMessage } from '@/realtime/messages'
import type { Channel } from '@/realtime/channel'
import { createSupabaseChannel } from '@/realtime/supabaseChannel'
import { buttonState, loadIdentity, saveName } from '@/play/playerIdentity'

const BUTTON_STYLES: Record<ReturnType<typeof buttonState>, string> = {
  waiting: 'bg-slate-700 text-slate-400',
  armed: 'bg-emerald-500 text-emerald-950 active:bg-emerald-400',
  locked: 'bg-slate-700 text-slate-400',
  eliminated: 'bg-rose-800 text-rose-200',
}

const BUTTON_LABELS: Record<ReturnType<typeof buttonState>, string> = {
  waiting: 'Conectando…',
  armed: '¡PULSA!',
  locked: 'Espera',
  eliminated: 'Fuera de esta canción',
}

function PlayScreen() {
  const room = (useSearchParams().get('sala') ?? '').toUpperCase()
  const [identity, setIdentity] = useState<{ playerId: string; name: string | null } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [state, setState] = useState<PublicState | null>(null)
  const channelRef = useRef<Channel | null>(null)

  useEffect(() => {
    setIdentity(loadIdentity(window.localStorage))
  }, [])

  useEffect(() => {
    if (!room || !identity?.name) return
    let closed = false
    const channel = createSupabaseChannel(room)
    channelRef.current = channel

    void (async () => {
      await channel.subscribe((raw) => {
        const message = parseHostMessage(raw)
        if (message?.type === 'STATE') setState(message.state)
      })
      if (closed) return
      await channel.publish({ type: 'JOIN', playerId: identity.playerId, name: identity.name })
    })()

    return () => {
      closed = true
      void channel.close()
      channelRef.current = null
    }
  }, [room, identity?.playerId, identity?.name])

  // Self-healing: if the host does not know us (it restarted, or our JOIN was
  // lost), announce ourselves again on every state we are missing from.
  useEffect(() => {
    if (!state || !identity?.name) return
    if (state.players.some((p) => p.id === identity.playerId)) return
    void channelRef.current?.publish({
      type: 'JOIN',
      playerId: identity.playerId,
      name: identity.name,
    })
  }, [state, identity?.playerId, identity?.name])

  const status = useMemo(
    () => buttonState(state, identity?.playerId ?? ''),
    [state, identity?.playerId],
  )

  const buzz = useCallback(() => {
    if (status !== 'armed' || !identity) return
    navigator.vibrate?.(60)
    void channelRef.current?.publish({ type: 'BUZZ', playerId: identity.playerId })
  }, [status, identity])

  if (!room) {
    return <p className="p-8 text-slate-200">Falta el código de sala. Escanea el QR otra vez.</p>
  }

  if (!identity) return null

  if (!identity.name) {
    return (
      <form
        className="flex min-h-dvh flex-col justify-center gap-4 p-8"
        onSubmit={(event) => {
          event.preventDefault()
          const name = draftName.trim()
          if (!name) return
          saveName(window.localStorage, name)
          setIdentity({ ...identity, name })
        }}
      >
        <h1 className="text-2xl font-bold text-slate-100">Sala {room}</h1>
        <input
          autoFocus
          className="rounded-xl bg-slate-800 p-4 text-xl text-slate-100"
          placeholder="Tu nombre"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
        <button className="rounded-xl bg-emerald-500 p-4 text-xl font-bold text-emerald-950">
          Entrar
        </button>
      </form>
    )
  }

  const me = state?.players.find((p) => p.id === identity.playerId)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-baseline justify-between p-4 text-slate-300">
        <span className="text-lg font-semibold">{identity.name}</span>
        <span className="text-2xl font-bold tabular-nums">{me?.score ?? 0}</span>
      </header>
      <button
        onPointerDown={buzz}
        disabled={status !== 'armed'}
        className={`flex-1 text-5xl font-black tracking-tight transition-colors ${BUTTON_STYLES[status]}`}
      >
        {BUTTON_LABELS[status]}
      </button>
    </div>
  )
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayScreen />
    </Suspense>
  )
}
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores de tipos, suite en verde

- [ ] **Step 7: Commit**

```bash
git add src/play src/app/play
git commit -m "feat: pantalla del jugador con botón de buzzer"
```

---

### Task 12: Pantalla del anfitrión

**Files:**
- Create: `src/host/useHostGame.ts`
- Create: `src/host/persistence.ts`
- Create: `src/app/host/page.tsx`
- Test: `src/host/persistence.test.ts`

**Interfaces:**
- Consumes: `initialState`, `reduce`, `currentSong` de `@/game/reducer`; `toPublicState` de `@/game/publicState`; `shuffle`, `createRoomCode` de `@/game/random`; `parsePlayerMessage` de `@/realtime/messages`; `createSupabaseChannel`; `AudioPlayer`; `YouTubeStage`; `parseSongs` de `@/songs/schema`.
- Produces: desde `@/host/persistence`: `saveGame(storage, room, state): void`, `loadGame(storage): { room: string; state: GameState } | null`, `clearGame(storage): void`. Desde `@/host/useHostGame`: hook `useHostGame(songs: Song[])`. Ruta `/host`.

- [ ] **Step 1: Escribir los tests de persistencia que fallan**

Crear `src/host/persistence.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { clearGame, loadGame, saveGame } from '@/host/persistence'
import { initialState, reduce } from '@/game/reducer'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

describe('host persistence', () => {
  test('an accidental reload does not lose the game', () => {
    const storage = new MemoryStorage()
    let state = reduce(initialState(), { type: 'JOIN', playerId: 'p1', name: 'Ana' })
    state = reduce(state, { type: 'START_GAME', deck: ['s1', 's2'], roundsTotal: 2 })
    state = reduce(state, { type: 'BUZZ', playerId: 'p1' })
    state = reduce(state, { type: 'JUDGE', correct: true })

    saveGame(storage, 'KZTR', state)

    expect(loadGame(storage)).toEqual({ room: 'KZTR', state })
  })

  test('returns null when there is nothing saved', () => {
    expect(loadGame(new MemoryStorage())).toBeNull()
  })

  test('returns null instead of throwing on corrupted data', () => {
    const storage = new MemoryStorage()
    storage.setItem('hitster:host', 'not json {{{')
    expect(loadGame(storage)).toBeNull()
  })

  test('clearing wipes the saved game, so a new party starts fresh', () => {
    const storage = new MemoryStorage()
    saveGame(storage, 'KZTR', initialState())
    clearGame(storage)
    expect(loadGame(storage)).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/host/persistence"`

- [ ] **Step 3: Implementar la persistencia**

Crear `src/host/persistence.ts`:

```typescript
import type { GameState } from '@/game/types'

const KEY = 'hitster:host'

export function saveGame(storage: Storage, room: string, state: GameState): void {
  storage.setItem(KEY, JSON.stringify({ room, state }))
}

/** Corrupted or absent data means "no game": never let this crash the host. */
export function loadGame(storage: Storage): { room: string; state: GameState } | null {
  const raw = storage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { room?: unknown; state?: unknown }
    if (typeof parsed.room !== 'string' || typeof parsed.state !== 'object' || !parsed.state) {
      return null
    }
    return { room: parsed.room, state: parsed.state as GameState }
  } catch {
    return null
  }
}

export function clearGame(storage: Storage): void {
  storage.removeItem(KEY)
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite en verde

- [ ] **Step 5: Escribir el hook del anfitrión**

Crear `src/host/useHostGame.ts`:

```typescript
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_ROUNDS } from '@/game/config'
import { currentSong, initialState, reduce } from '@/game/reducer'
import { toPublicState } from '@/game/publicState'
import { createRoomCode, shuffle } from '@/game/random'
import type { GameEvent, GameState, Song } from '@/game/types'
import type { AudioPlayer } from '@/audio/audioPlayer'
import type { Channel } from '@/realtime/channel'
import { parsePlayerMessage } from '@/realtime/messages'
import { createSupabaseChannel } from '@/realtime/supabaseChannel'
import { clearGame, loadGame, saveGame } from '@/host/persistence'

const TICK_MS = 50

export function useHostGame(songs: Song[]) {
  const [room, setRoom] = useState<string | null>(null)
  const [state, setState] = useState<GameState>(initialState)
  const audioRef = useRef<AudioPlayer | null>(null)
  const channelRef = useRef<Channel | null>(null)

  // Restore after a reload, or mint a fresh room.
  useEffect(() => {
    const saved = loadGame(window.localStorage)
    if (saved) {
      setRoom(saved.room)
      setState(saved.state)
    } else {
      setRoom(createRoomCode(Math.random))
    }
  }, [])

  const dispatch = useCallback((event: GameEvent) => {
    setState((previous) => reduce(previous, event))
  }, [])

  // Persist and broadcast on every change.
  useEffect(() => {
    if (!room) return
    saveGame(window.localStorage, room, state)
    void channelRef.current?.publish({ type: 'STATE', state: toPublicState(state) })
  }, [room, state])

  // Listen to the phones. The host decides the winner by arrival order:
  // the reducer ignores every BUZZ after the first.
  useEffect(() => {
    if (!room) return
    const channel = createSupabaseChannel(room)
    channelRef.current = channel

    void channel.subscribe((raw) => {
      const message = parsePlayerMessage(raw)
      if (!message) return
      if (message.type === 'JOIN') {
        dispatch({ type: 'JOIN', playerId: message.playerId, name: message.name })
      } else {
        dispatch({ type: 'BUZZ', playerId: message.playerId })
      }
    })

    return () => {
      void channel.close()
      channelRef.current = null
    }
  }, [room, dispatch])

  // The engine owns the clock; the player just obeys.
  useEffect(() => {
    if (state.phase.kind !== 'playing') return
    const id = setInterval(() => dispatch({ type: 'TICK', deltaMs: TICK_MS }), TICK_MS)
    return () => clearInterval(id)
  }, [state.phase.kind, dispatch])

  const song = useMemo(() => currentSong(state, songs), [state, songs])
  const phase = state.phase

  // Audio follows the phase: a new tier restarts the song, a buzz cuts it,
  // a wrong answer resumes at the cut point.
  const tier = phase.kind === 'playing' ? phase.tier : null
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !song || tier === null) return
    void audio.play(song.videoId, song.startSeconds)
  }, [song, tier])

  useEffect(() => {
    if (phase.kind === 'buzzed') audioRef.current?.pause()
    if (phase.kind === 'revealed' || phase.kind === 'finished') audioRef.current?.stop()
  }, [phase.kind])

  // Buffer the next song while this one plays, so there is no dead air.
  useEffect(() => {
    const next = songs.find((s) => s.id === state.deck[0])
    if (next) void audioRef.current?.preload(next.videoId, next.startSeconds)
  }, [state.deck, songs])

  const startGame = useCallback(() => {
    const deck = shuffle(
      songs.map((s) => s.id),
      Math.random,
    )
    dispatch({
      type: 'START_GAME',
      deck,
      roundsTotal: Math.min(DEFAULT_ROUNDS, deck.length),
    })
  }, [songs, dispatch])

  const attachAudio = useCallback((player: AudioPlayer) => {
    audioRef.current = player
  }, [])

  const newGame = useCallback(() => {
    clearGame(window.localStorage)
    window.location.reload()
  }, [])

  return { room, state, song, dispatch, startGame, attachAudio, newGame }
}
```

- [ ] **Step 6: Escribir la pantalla del anfitrión**

```bash
npm install qrcode
npm install -D @types/qrcode
```

Crear `src/app/host/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { YouTubeStage } from '@/audio/youtubeIframes'
import { pointsForTier } from '@/game/tiers'
import { parseSongs } from '@/songs/schema'
import rawSongs from '@/songs/songs.json'
import { useHostGame } from '@/host/useHostGame'

const songs = parseSongs(rawSongs)

function JoinQr({ room }: { room: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const url = `${window.location.origin}/play?sala=${room}`
    void QRCode.toDataURL(url, { width: 420, margin: 1 }).then(setDataUrl)
  }, [room])

  // eslint-disable-next-line @next/next/no-img-element
  return dataUrl ? <img src={dataUrl} alt={`Unirse a la sala ${room}`} className="rounded-xl" /> : null
}

export default function HostPage() {
  const { room, state, song, dispatch, startGame, attachAudio, newGame } = useHostGame(songs)
  if (!room) return null

  const scoreboard = [...state.players].sort((a, b) => b.score - a.score)
  const buzzer =
    state.phase.kind === 'buzzed'
      ? state.players.find((p) => p.id === state.phase.playerId)
      : undefined

  return (
    <main className="grid min-h-dvh grid-cols-[1fr_20rem] bg-slate-950 text-slate-100">
      <YouTubeStage onReady={attachAudio} />

      <section className="flex flex-col items-center justify-center gap-8 p-10 text-center">
        {state.phase.kind === 'lobby' && (
          <>
            <h1 className="text-6xl font-black">Sala {room}</h1>
            <JoinQr room={room} />
            <p className="text-xl text-slate-400">
              {state.players.length} jugador{state.players.length === 1 ? '' : 'es'} conectado
              {state.players.length === 1 ? '' : 's'}
            </p>
            <button
              onClick={startGame}
              disabled={state.players.length === 0}
              className="rounded-2xl bg-emerald-500 px-10 py-5 text-2xl font-bold text-emerald-950 disabled:bg-slate-700 disabled:text-slate-500"
            >
              Empezar partida
            </button>
          </>
        )}

        {state.phase.kind === 'playing' && (
          <>
            <p className="text-2xl text-slate-400">
              Canción {state.roundsPlayed} de {state.roundsTotal}
            </p>
            <p className="text-[10rem] font-black leading-none">
              {pointsForTier(state.phase.tier)}
            </p>
            <p className="text-3xl text-slate-400">puntos en juego</p>
            <button onClick={() => dispatch({ type: 'SKIP_SONG' })} className="text-slate-500 underline">
              Saltar canción
            </button>
          </>
        )}

        {state.phase.kind === 'buzzed' && (
          <>
            <p className="text-8xl font-black">{buzzer?.name}</p>
            <p className="text-2xl text-slate-400">
              vale {pointsForTier(state.phase.tier)} puntos
            </p>
            <div className="flex gap-6">
              <button
                onClick={() => dispatch({ type: 'JUDGE', correct: true })}
                className="rounded-2xl bg-emerald-500 px-14 py-8 text-5xl font-bold text-emerald-950"
              >
                ✅
              </button>
              <button
                onClick={() => dispatch({ type: 'JUDGE', correct: false })}
                className="rounded-2xl bg-rose-600 px-14 py-8 text-5xl font-bold text-rose-50"
              >
                ❌
              </button>
            </div>
          </>
        )}

        {state.phase.kind === 'revealed' && (
          <>
            <p className="text-6xl font-black">{song?.title}</p>
            <p className="text-4xl text-slate-300">{song?.artist}</p>
            <p className="text-8xl font-black text-emerald-400">{song?.year}</p>
            <button
              onClick={() => dispatch({ type: 'NEXT_ROUND' })}
              className="rounded-2xl bg-emerald-500 px-10 py-5 text-2xl font-bold text-emerald-950"
            >
              Siguiente canción
            </button>
          </>
        )}

        {state.phase.kind === 'finished' && (
          <>
            <h1 className="text-6xl font-black">Fin de la partida</h1>
            <p className="text-4xl text-emerald-400">Gana {scoreboard[0]?.name}</p>
            <button onClick={newGame} className="rounded-2xl bg-emerald-500 px-10 py-5 text-2xl font-bold text-emerald-950">
              Nueva partida
            </button>
          </>
        )}
      </section>

      <aside className="border-l border-slate-800 p-6">
        <h2 className="mb-4 text-sm uppercase tracking-widest text-slate-500">Marcador</h2>
        <ul className="space-y-3">
          {scoreboard.map((player) => (
            <li
              key={player.id}
              className={`flex justify-between text-2xl ${
                state.lockedOut.includes(player.id) ? 'text-slate-600 line-through' : ''
              }`}
            >
              <span>{player.name}</span>
              <span className="font-bold tabular-nums">{player.score}</span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  )
}
```

- [ ] **Step 7: Verificar que compila y que la suite sigue verde**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: sin errores en ninguno de los tres

- [ ] **Step 8: Commit**

```bash
git add src/host src/app/host package.json package-lock.json
git commit -m "feat: pantalla del anfitrión con marcador, QR y juicio"
```

---

### Task 13: Modo teclado de respaldo

**Files:**
- Create: `src/host/keyboardPlayers.ts`
- Modify: `src/app/host/page.tsx` (montar el modo teclado)
- Test: `src/host/keyboardPlayers.test.ts`

**Interfaces:**
- Consumes: `GameEvent` de `@/game/types`.
- Produces: desde `@/host/keyboardPlayers`: `KEYBOARD_KEYS: readonly string[]`, `keyboardPlayerId(key: string): string`, `eventForKey(key: string, registeredKeys: string[]): GameEvent | null`.

**Nota de diseño:** el teclado entra al **mismo reducer** por la misma puerta que los celulares. No hay una segunda implementación de las reglas; solo otra fuente de eventos.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/host/keyboardPlayers.test.ts`:

```typescript
import { describe, expect, test } from 'vitest'
import { KEYBOARD_KEYS, eventForKey, keyboardPlayerId } from '@/host/keyboardPlayers'

describe('keyboard fallback', () => {
  test('offers keys that are far apart on a physical keyboard', () => {
    expect(KEYBOARD_KEYS).toEqual(['a', 'g', 'l', 'z', 'm', '0'])
  })

  test('maps a key to a stable player id', () => {
    expect(keyboardPlayerId('a')).toBe('key:a')
    expect(keyboardPlayerId('a')).toBe(keyboardPlayerId('a'))
  })

  test('a registered key produces a buzz for its player', () => {
    expect(eventForKey('a', ['a', 'l'])).toEqual({ type: 'BUZZ', playerId: 'key:a' })
  })

  test('an unregistered key does nothing', () => {
    expect(eventForKey('q', ['a', 'l'])).toBeNull()
  })

  test('is case-insensitive, since Caps Lock happens at parties', () => {
    expect(eventForKey('A', ['a'])).toEqual({ type: 'BUZZ', playerId: 'key:a' })
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/host/keyboardPlayers"`

- [ ] **Step 3: Implementar**

Crear `src/host/keyboardPlayers.ts`:

```typescript
import type { GameEvent } from '@/game/types'

/** Spread across the keyboard so elbows do not collide around one laptop. */
export const KEYBOARD_KEYS = ['a', 'g', 'l', 'z', 'm', '0'] as const

export function keyboardPlayerId(key: string): string {
  return `key:${key.toLowerCase()}`
}

/** Keyboard input enters the very same reducer the phones feed. */
export function eventForKey(key: string, registeredKeys: string[]): GameEvent | null {
  const normalised = key.toLowerCase()
  if (!registeredKeys.includes(normalised)) return null
  return { type: 'BUZZ', playerId: keyboardPlayerId(normalised) }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite en verde

- [ ] **Step 5: Enchufar el teclado a la pantalla del anfitrión**

En `src/app/host/page.tsx`, **reemplazar** la línea `import { useEffect, useState } from 'react'` por estas tres:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { GameEvent } from '@/game/types'
import { KEYBOARD_KEYS, eventForKey, keyboardPlayerId } from '@/host/keyboardPlayers'
```

Añadir este componente encima de `HostPage`:

```tsx
function KeyboardFallback({ dispatch }: { dispatch: (event: GameEvent) => void }) {
  const [keys, setKeys] = useState<string[]>([])

  const register = useCallback(
    (key: string, name: string) => {
      dispatch({ type: 'JOIN', playerId: keyboardPlayerId(key), name })
      setKeys((previous) => (previous.includes(key) ? previous : [...previous, key]))
    },
    [dispatch],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const gameEvent = eventForKey(event.key, keys)
      if (gameEvent) dispatch(gameEvent)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keys, dispatch])

  return (
    <details className="mt-6 text-left text-slate-400">
      <summary className="cursor-pointer text-sm uppercase tracking-widest">
        Sin wifi: jugar con teclado
      </summary>
      <div className="mt-3 space-y-2">
        {KEYBOARD_KEYS.map((key) => (
          <form
            key={key}
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement
              const name = input.value.trim()
              if (name) register(key, name)
              input.value = ''
            }}
          >
            <span className="w-10 rounded bg-slate-800 text-center font-mono uppercase">{key}</span>
            <input name="name" placeholder="Nombre" className="flex-1 rounded bg-slate-800 px-2" />
            <button className="rounded bg-slate-700 px-3">Asignar</button>
          </form>
        ))}
      </div>
    </details>
  )
}
```

Y renderizarlo dentro del bloque de `lobby`, justo después del botón "Empezar partida":

```tsx
            <KeyboardFallback dispatch={dispatch} />
```

- [ ] **Step 6: Verificar compilación y build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: los tres en verde

- [ ] **Step 7: Commit**

```bash
git add src/host/keyboardPlayers.ts src/host/keyboardPlayers.test.ts src/app/host/page.tsx
git commit -m "feat: modo teclado de respaldo sobre el mismo motor de juego"
```

---

### Task 14: Despliegue en Vercel y prueba de humo

**Files:**
- Create: `src/app/page.tsx` (reemplazar la portada de `create-next-app`)
- Create: `README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la app desplegada y verificada con dos teléfonos reales.

- [ ] **Step 1: Escribir la portada**

Reemplazar `src/app/page.tsx` con:

```tsx
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-950 text-slate-100">
      <h1 className="text-5xl font-black">Adivina la canción</h1>
      <Link
        href="/host"
        className="rounded-2xl bg-emerald-500 px-10 py-5 text-2xl font-bold text-emerald-950"
      >
        Montar una partida
      </Link>
      <p className="text-slate-500">Los jugadores entran escaneando el QR de la pantalla.</p>
    </main>
  )
}
```

- [ ] **Step 2: Escribir el README**

Crear `README.md`:

```markdown
# Adivina la canción

Juego de buzzer musical presencial. Suena un fragmento de una canción de
YouTube y los jugadores compiten por pulsar primero desde su celular. Quien
acierta título y artista puntúa: 5 puntos si pulsó en los primeros 5 segundos,
3 en los primeros 10, 1 en los primeros 30. Fallar cuesta 1 punto y te deja
fuera de esa canción.

## Montar una partida

1. Abre `/host` en la laptop conectada al parlante, en pantalla completa.
2. Los jugadores escanean el QR y escriben su nombre.
3. Pulsa **Empezar partida**. El jugador que pulsa dice su respuesta en voz
   alta y tú juzgas con ✅ o ❌.

Inicia sesión en YouTube en ese navegador para que Premium quite los anuncios.

## Desarrollo

```bash
npm install
cp .env.local.example .env.local   # rellenar con las claves de Supabase
npm run dev
npm test
npm run check-songs                # valida songs.json contra YouTube
```

## Armar el mazo

Importa una playlist de YouTube entera (necesita `YOUTUBE_API_KEY`, gratis en
Google Cloud Console con *YouTube Data API v3* habilitada):

```bash
export YOUTUBE_API_KEY=...
npm run import-playlist -- "https://www.youtube.com/playlist?list=..."
```

Eso rellena `videoId`, `title` y una conjetura de `artist`. Faltan dos campos
que **no se pueden automatizar**:

- `year` — YouTube no lo sabe.
- `startSeconds` — el segundo donde la canción **se reconoce**, saltando la
  intro. Es lo que decide si el juego engancha.

`npm run check-songs` te los reclama uno por uno hasta que el mazo esté listo,
y de paso verifica que ningún video esté bloqueado para embebido.
```

- [ ] **Step 3: Desplegar en Vercel**

```bash
npx vercel --prod
```

En el panel de Vercel, añadir las variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con los valores del proyecto de Supabase, y volver a desplegar.

- [ ] **Step 4: Prueba de humo con dos teléfonos**

Recorrer esta lista en la app desplegada, con la laptop en `/host` y dos teléfonos reales:

- [ ] El QR abre `/play` y ambos teléfonos aparecen en la lista del anfitrión.
- [ ] Al empezar, suena audio sin anuncios y sin retraso perceptible.
- [ ] Pulsar corta la música al instante y bloquea el otro teléfono.
- [ ] ✅ suma los puntos del tramo mostrado en pantalla.
- [ ] ❌ resta 1 punto, tacha al jugador en el marcador y **la música retoma donde se cortó**.
- [ ] Sin pulsaciones, la canción reinicia al llegar a 5 s y a 15 s (tramos 2 y 3).
- [ ] Entre canciones no hay silencio perceptible (el doble búfer funciona).
- [ ] Bloquear y desbloquear un teléfono a mitad de ronda: vuelve con su nombre y sus puntos.
- [ ] Recargar `/host` a mitad de partida: el marcador y la ronda sobreviven.
- [ ] "Saltar canción" avanza sin puntuar.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx README.md
git commit -m "feat: portada, README y despliegue en Vercel"
```

---

## Notas de revisión del plan

**Cobertura del spec.** Cada sección del diseño tiene su task: reglas de la
ronda (3-5), datos de canciones y validación (7), importación del mazo desde
una playlist de YouTube (7b), arquitectura y protocolo (8),
audio con doble búfer (9-10), pantallas (11-12), teclado de respaldo (13),
persistencia del anfitrión (12), estado público anti-trampas (6), despliegue y
prueba de humo (14). Las mejoras listadas como fuera de alcance en el spec
siguen fuera de alcance aquí.

**Adición posterior al spec.** La Task 7b (importar el mazo desde una playlist
de YouTube) no estaba en el diseño original; se acordó después de escribirlo.
Es independiente del motor de juego, así que puede ejecutarse en cualquier
momento a partir de la Task 7. El spec no se reescribió: la fuente de verdad
de esa decisión es este plan.

**Fuentes de música dinámicas (YouTube o Spotify), fuera de alcance.** Está
anotado en la sección 9 del spec. No hay tasks aquí, pero sí afecta a cómo se
implementa lo que sí está: `AudioPlayer` (Task 9) es la costura por la que
entrará Spotify, así que **mantenla libre de cualquier detalle de YouTube** —
nada de `videoId` en su firma más allá de la cadena opaca que ya recibe, y
ninguna suposición sobre el IFrame API fuera de `youtubePlayer.ts` y
`youtubeIframes.tsx`. La otra mitad del trabajo futuro, extraer un
`MusicSource` que provea el mazo con su metadata, no existe todavía: hoy ese
papel lo cumplen `songs.json` y `parseSongs`.

**Dependencia cruzada conocida.** Dos tests escritos en la Task 4 (`scores may
go negative` y `an eliminated player is available again on the next song`)
dependen de `NEXT_ROUND`, que se implementa en la Task 5. Está señalado
explícitamente en el Step 4 de la Task 4: la suite queda parcialmente roja al
cerrar esa task y verde al cerrar la 5. Es deliberado — esos tests describen
reglas de eliminación, no de avance de ronda, y separarlos las dispersaría.
