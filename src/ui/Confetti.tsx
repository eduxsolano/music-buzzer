import type { CSSProperties } from 'react'

/**
 * Paper, falling. Two moments in the whole evening earn it: the winner at the
 * end of the night on the television, and the phone of whoever was just
 * judged correct.
 *
 * Written by hand rather than pulled in as a dependency, and drawn with CSS
 * transforms only — no canvas, no per-frame JavaScript — so it costs the
 * compositor a few dozen layers and the main thread nothing. That matters on
 * the host: the same laptop is decoding a YouTube stream.
 */

/** The signal hues of the design system, in the order the pieces cycle them. */
const COLOURS = ['var(--gold)', 'var(--green)', 'var(--steel)', 'var(--amber)', 'var(--red)']

/**
 * A stable, evenly-spread pseudo-random in 0…1.
 *
 * Deliberately not `Math.random()`: these components render inside client
 * trees that Next.js also prerenders, and a random value would differ between
 * the two renders and trip a hydration mismatch. A pure function of the piece
 * index gives the same scatter every time and still looks unordered.
 */
function scatter(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

export function Confetti({ pieces = 70 }: { pieces?: number }) {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: pieces }, (_, index) => {
        const style: CSSProperties & Record<string, string> = {
          left: `${scatter(index, 1) * 100}%`,
          width: `${6 + scatter(index, 2) * 7}px`,
          height: `${9 + scatter(index, 3) * 8}px`,
          background: COLOURS[index % COLOURS.length],
          borderRadius: index % 4 === 0 ? '999px' : '2px',
          animationDelay: `${scatter(index, 4) * 1.4}s`,
          animationDuration: `${2.6 + scatter(index, 5) * 2.4}s`,
          '--drift': `${(scatter(index, 6) - 0.5) * 34}vw`,
          '--spin': `${(scatter(index, 7) - 0.5) * 1800}deg`,
        }
        return <i key={index} className="confetti-piece" style={style} />
      })}
    </div>
  )
}
