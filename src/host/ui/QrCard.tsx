'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * The only light surfaces in the whole design — a QR needs its quiet zone to
 * scan reliably from across a room — kept to the size of a beer mat so they
 * never become a lamp pointed at the sofa.
 *
 * Two of them exist, and they are not the same thing: one is public and stays
 * up all evening, the other carries the panel's pairing secret and comes down
 * as soon as it has been scanned.
 */
export function QrCard({
  url,
  alt,
  size = 'lg',
}: {
  url: string
  alt: string
  size?: 'lg' | 'sm'
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    void QRCode.toDataURL(url, {
      width: 480,
      margin: 1,
      color: { dark: '#0b0d12', light: '#f4f6fa' },
    }).then(setDataUrl)
  }, [url])

  const box =
    size === 'lg'
      ? 'h-[clamp(11rem,20vw,17rem)] w-[clamp(11rem,20vw,17rem)]'
      : 'h-[clamp(7rem,12vw,10rem)] w-[clamp(7rem,12vw,10rem)]'

  return (
    <div className={`qr-card grid place-items-center ${box}`}>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt={alt} className="h-full w-full rounded-lg" />
      ) : null}
    </div>
  )
}
