import { TIERS } from '@/game/config'
import type { Tier } from '@/game/tiers'
import { tierDurationMs } from '@/game/tiers'
import { tierProgress } from '@/host/ui/stagePresentation'

/**
 * The tier clock, drawn as a hairline across the very top of the stage. It is
 * peripheral on purpose: the room should feel the time running out without
 * anything pulling focus from the number in the middle of the screen.
 *
 * `null` means no tier is in play — lobby, reveal, end of game — and the
 * track sits empty rather than full.
 */
export function TierMeter({ tier, elapsedMs }: { tier: Tier | null; elapsedMs: number }) {
  const remaining = tier === null ? 0 : 1 - tierProgress(elapsedMs, tierDurationMs(tier))

  return (
    <div className="relative">
      <div className="meter" role="presentation">
        <div className="meter-fill" style={{ transform: `scaleX(${remaining})` }} />
      </div>
      <div className="absolute right-[clamp(1rem,1.6vw,2rem)] top-4 flex items-center gap-2">
        {TIERS.map((config) => (
          <span key={config.tier} className="tier-dot" data-on={tier !== null && config.tier <= tier} />
        ))}
      </div>
    </div>
  )
}
