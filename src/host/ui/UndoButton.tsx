'use client'

import type { HostView } from '@/host/ui/hostView'

/**
 * Taking back the last judgement, from the laptop.
 *
 * The control that matters lives on the host's phone, where the judging
 * happens — but a host without a paired panel would otherwise have no way to
 * undo at all, and a mistaken ❌ is the one thing in this game that cannot be
 * argued back. It reveals nothing about the song, so there is no reason for
 * the television not to offer it.
 *
 * Deliberately quiet and deliberately last in the row: it is never the thing
 * the host means to press next, and a big button here would be pressed by
 * accident on the way to "siguiente canción".
 */
export function UndoButton({ view }: { view: HostView }) {
  if (!view.canUndo) return null
  return (
    <button onClick={view.undo} className="btn btn-ghost px-6 py-3 text-sm">
      Deshacer juicio
    </button>
  )
}
