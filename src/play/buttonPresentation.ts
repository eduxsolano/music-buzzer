import type { ButtonState } from '@/play/playerIdentity'

/**
 * How each button state looks and reads on the phone.
 *
 * This is presentation only: `buttonState()` in `playerIdentity.ts` decides
 * *which* state applies and is not touched here. The phone is held 30 cm from
 * a face in a dark room, so every state is a low-luminance field with a ring
 * — the colours live in `.pad[data-state=…]` in `globals.css`.
 */
export interface ButtonPresentation {
  /** One word, readable at a glance without focusing. */
  label: string
  /** A second line, only where the word alone is not enough. */
  hint: string | null
  /** `breathe` invites a press; `burst` celebrates winning the race. */
  motion: 'none' | 'breathe' | 'burst'
}

export const BUTTON_PRESENTATION: Record<ButtonState, ButtonPresentation> = {
  connecting: {
    label: 'Conectando',
    hint: 'Buscando la partida',
    motion: 'none',
  },
  armed: {
    label: 'Pulsa',
    hint: null,
    motion: 'breathe',
  },
  locked: {
    label: 'Espera',
    hint: 'Ahora no te toca',
    motion: 'none',
  },
  won: {
    label: '¡Ganaste!',
    hint: 'Di el título y el artista en voz alta',
    motion: 'burst',
  },
  celebrating: {
    label: '¡Acertaste!',
    hint: 'Puntos para ti',
    motion: 'burst',
  },
  eliminated: {
    label: 'Fuera',
    hint: 'Vuelves en la siguiente canción',
    motion: 'none',
  },
}
