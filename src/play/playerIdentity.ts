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
