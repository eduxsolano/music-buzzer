import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-950 text-slate-100">
      <h1 className="text-5xl font-black">Adivina la canción</h1>
      <Link
        href="/host"
        className="rounded-2xl bg-emerald-500 px-10 py-5 text-2xl font-bold text-emerald-950"
      >
        Montar una partida
      </Link>
      <p className="text-slate-500">Los jugadores entran escaneando el QR de la pantalla.</p>
    </main>
  )
}
