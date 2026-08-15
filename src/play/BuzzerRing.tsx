/**
 * The tier clock, drawn around the buzzer instead of written inside it.
 *
 * A player in this game is looking at the other players and at the
 * television, not at their hand. A draining arc is readable out of the corner
 * of an eye; a numeral is not. It also leaves the middle of the button empty,
 * and the button is the whole interaction — the only number that stays is the
 * one that is actually a decision, what a press is worth.
 *
 * The arc is only ever rendered while a tier is genuinely running: the caller
 * passes `null` otherwise (see `ringFraction`). It inherits `--pad-ring` from
 * the pad's own state block rather than introducing an accent of its own, so
 * it stays inside the luminance the phone screens were designed to.
 */

/** Drawn on a 100×100 viewBox, so the geometry is independent of screen size. */
const RADIUS = 47
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function BuzzerRing({ fraction }: { fraction: number }) {
  return (
    <svg className="pad-progress" viewBox="0 0 100 100" aria-hidden>
      <circle
        className="pad-progress-fill"
        cx="50"
        cy="50"
        r={RADIUS}
        style={{
          strokeDasharray: CIRCUMFERENCE,
          // Drains clockwise from twelve o'clock; the SVG is rotated a quarter
          // turn in CSS so the gap opens where an eye expects a clock to start.
          strokeDashoffset: CIRCUMFERENCE * (1 - fraction),
        }}
      />
    </svg>
  )
}
