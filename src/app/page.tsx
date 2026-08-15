import Link from 'next/link'
import { TIERS } from '@/game/config'

/**
 * Seen for about three seconds before someone clicks through. It belongs to
 * the same dark stage as the other two screens and does one extra thing: the
 * scoring is the artwork, so the whole game is explained before the click.
 */
export default function HomePage() {
  return (
    <main className="stage flex min-h-dvh flex-col items-center justify-center gap-[clamp(1.5rem,4vh,3rem)] p-8 text-center">
      <p className="kicker">Juego de buzzer musical</p>
      <h1 className="hero hero-md max-w-[14ch]">Adivina la canción</h1>

      <ul className="flex flex-wrap items-end justify-center gap-[clamp(0.75rem,2vw,1.75rem)]">
        {TIERS.map((tier) => (
          <li
            key={tier.tier}
            className="flex min-w-[6.5rem] flex-col items-center gap-1 rounded-2xl px-6 py-4"
            style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,0.02)' }}
          >
            <span className="hero" style={{ fontSize: 'clamp(2.25rem,5vw,3.5rem)' }}>
              {tier.points}
            </span>
            <span className="kicker" style={{ letterSpacing: '0.2em' }}>
              {tier.durationMs / 1000} s
            </span>
          </li>
        ))}
      </ul>

      <p className="note max-w-[34ch]">
        Cuanto antes pulses, más vale acertar el título y el artista.
      </p>

      <Link href="/host" className="btn btn-primary px-10 py-5 text-lg">
        Montar una partida
      </Link>

      <p className="text-sm" style={{ color: 'var(--text-low)' }}>
        Los jugadores entran escaneando el QR de la pantalla.
      </p>
    </main>
  )
}
