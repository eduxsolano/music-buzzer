import type { PublicState } from '@/game/publicState'

const ID_KEY = 'hitster:playerId'
const NAME_KEY = 'hitster:playerName'

/**
 * `connecting` used to be called `waiting`. It was renamed the moment the
 * engine gained a phase of that name, because the two mean opposite things:
 * the engine's `waiting` is the host holding the room between tiers, and the
 * button is very much pressable in it.
 */
export type ButtonState =
  | 'connecting'
  | 'armed'
  | 'locked'
  | 'won'
  | 'celebrating'
  | 'eliminated'

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
  if (!state) return 'connecting'
  // Being named the round's winner outranks everything: this phone has just
  // been judged correct and gets the only celebration it will ever see.
  if (state.phase === 'revealed' && state.outcome === 'correct' && state.winnerId === playerId) {
    return 'celebrating'
  }
  if (state.lockedOut.includes(playerId)) return 'eliminated'
  if (state.phase === 'buzzed' && state.buzzedPlayerId === playerId) return 'won'
  // `waiting` arms the button too: the host is holding the room between
  // tiers, and a press during that pause earns whatever the last tier played
  // was worth. The pause is part of the round, not a gap in it.
  return state.phase === 'playing' || state.phase === 'waiting' ? 'armed' : 'locked'
}
