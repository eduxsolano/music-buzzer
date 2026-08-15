import type { ReactNode } from 'react'

/**
 * The shape every phase of the host screen takes.
 *
 * Four slots, always in the same order and the same place on the television:
 * a small label, one protagonist, a subordinate line, and the host's
 * controls. A new phase fills these four slots and inherits the rhythm for
 * free — no phase invents its own layout.
 */
export function StagePanel({
  kicker,
  hero,
  note,
  actions,
}: {
  kicker?: ReactNode
  hero: ReactNode
  note?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(1rem,2.5vh,2.5rem)] px-[clamp(1.5rem,4vw,5rem)] text-center">
      {kicker ? <p className="kicker enter enter-1">{kicker}</p> : null}
      <div className="flex w-full flex-col items-center gap-[clamp(1rem,2.5vh,2.5rem)]">
        {hero}
      </div>
      {note ? <p className="note enter enter-2">{note}</p> : null}
      {actions ? (
        <div className="enter enter-3 mt-[clamp(0.5rem,2vh,2rem)] flex flex-wrap items-center justify-center gap-[clamp(1rem,2vw,2rem)]">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/** The protagonist: display type, mood-coloured, sized to fit by `heroSizeClass`. */
export function Hero({
  children,
  sizeClass,
  animation = 'enter',
}: {
  children: ReactNode
  sizeClass: string
  animation?: 'enter' | 'slam' | 'none'
}) {
  const motion = animation === 'none' ? '' : animation
  return <h1 className={`hero ${sizeClass} ${motion}`}>{children}</h1>
}
