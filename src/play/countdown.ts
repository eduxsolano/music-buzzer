/**
 * What the buzzer should show, given what the host said was left and how long
 * ago it said it.
 *
 * The host publishes a STATE only when its public projection actually
 * changes — roughly once per tier — so the phone cannot be told the time
 * twenty times a second and must run its own clock in between. It counts down
 * from the remainder that arrived with the last message.
 *
 * A tier only drains while it is sounding. Between tiers, and while somebody
 * is being judged, the number holds: it is then a promise about what the host
 * is going to play, not a measurement of anything running.
 */
export function displayedRemainingMs(
  sentRemainingMs: number | null,
  msSinceReceived: number,
  running: boolean,
): number | null {
  if (sentRemainingMs === null) return null
  if (!running) return sentRemainingMs
  // Clamped at both ends: a clock that jumped backwards (a phone waking up, a
  // message that arrived out of order) must never read as extra time.
  return Math.max(0, sentRemainingMs - Math.max(0, msSinceReceived))
}

/**
 * How much of the buzzer's ring is still drawn: 1 at the top of a tier, 0 at
 * its end, and **null when there is no tier running at all**.
 *
 * Null is the important case and the reason this is a function rather than a
 * division at the call site. Between tiers there is nothing to count, and both
 * ways of faking it lie: a full ring promises a tier that has not started, an
 * empty one says the time ran out. The host's tier meter shipped with exactly
 * that bug once — it read full whenever no tier was running — so the rule is
 * written down and tested here instead of living in a component.
 */
/** Where the last-seconds warning fires. Three is enough to decide, not enough to relax. */
export const PULSE_AT_MS = 3_000

/** One short pulse. A pattern would be a phone asking for attention it has not earned. */
export const PULSE_MS = 40

/**
 * Whether the phone should buzz once, right now.
 *
 * Six phones in a small room all vibrating every tier is noise, so this is
 * deliberately narrow: one pulse, only while a tier is actually sounding, only
 * on a phone whose owner can still do something about it, and never twice for
 * the same run of the clock — the caller holds `alreadyPulsed` and clears it
 * when the tier stops.
 *
 * A tier that resumes with less than three seconds left (the tail of a tier
 * somebody was judged wrong on) fires immediately, which is correct: three
 * seconds is what is left, and that is what the pulse means.
 */
export function shouldPulse(
  remainingMs: number | null,
  running: boolean,
  armed: boolean,
  alreadyPulsed: boolean,
): boolean {
  if (!running || !armed || alreadyPulsed) return false
  if (remainingMs === null) return false
  return remainingMs <= PULSE_AT_MS
}

export function ringFraction(
  remainingMs: number | null,
  tierDurationMs: number | null,
  running: boolean,
): number | null {
  if (!running) return null
  if (remainingMs === null || tierDurationMs === null || tierDurationMs <= 0) return null
  return Math.min(1, Math.max(0, remainingMs / tierDurationMs))
}
