import { countdownSeconds } from '@/game/countdown'

/**
 * The tier clock spelled out in numbers, directly under the points at stake.
 *
 * The hairline meter along the top of the stage is peripheral by design — you
 * feel it rather than read it. This is the other half: while the host holds
 * the room between tiers, "how long is the next one" is a question people ask
 * out loud, and it should be answered without anybody asking.
 *
 * `running` is false whenever the music is stopped, and the number simply
 * holds — a countdown that drains while nothing is playing would be a lie.
 */
export function TierCountdown({
  remainingMs,
  running,
}: {
  remainingMs: number
  running: boolean
}) {
  const seconds = countdownSeconds(remainingMs)
  return (
    <span className="countdown" data-running={running}>
      <span className="tabular-nums">{seconds}</span>
      <span className="countdown-unit">s</span>
    </span>
  )
}
