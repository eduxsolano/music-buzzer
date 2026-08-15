import type { Player } from '@/game/types'

/**
 * The one thing on screen that never changes shape between phases: a quiet
 * column on the right, always in the same place, so the room can glance at it
 * without hunting. Eliminated players stay listed — struck through and stood
 * down — because "who is still in this song" is information the room wants.
 */
export function Scoreboard({
  players,
  lockedOut,
}: {
  players: Player[]
  lockedOut: string[]
}) {
  const leadScore = players[0]?.score

  return (
    <aside className="rail flex flex-col gap-4 overflow-hidden p-[clamp(1rem,1.6vw,2rem)]">
      <h2 className="kicker">Marcador</h2>
      {players.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-low)' }}>
          Nadie todavía
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto text-[clamp(1.05rem,1.5vw,1.75rem)] font-semibold">
          {players.map((player, index) => (
            <li
              key={player.id}
              className="rail-row"
              data-out={lockedOut.includes(player.id)}
              data-lead={player.score === leadScore && index === 0}
            >
              <span className="rail-rank tabular-nums">{index + 1}</span>
              <span className="truncate">{player.name}</span>
              <span className="tabular-nums">{player.score}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
