'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * The only light surface in the whole design — a QR needs its quiet zone to
 * scan reliably from across a room — kept to the size of a beer mat so it
 * never becomes a lamp pointed at the sofa.
 */
export function JoinQr({ room }: { room: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const url = `${window.location.origin}/play?sala=${room}`
    void QRCode.toDataURL(url, {
      width: 480,
      margin: 1,
      color: { dark: '#0b0d12', light: '#f4f6fa' },
    }).then(setDataUrl)
  }, [room])

  return (
    <div className="qr-card grid h-[clamp(11rem,20vw,17rem)] w-[clamp(11rem,20vw,17rem)] place-items-center">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={`Unirse a la sala ${room}`}
          className="h-full w-full rounded-lg"
        />
      ) : null}
    </div>
  )
}
