import { TIERS, type TierConfig } from '@/game/config'

export type Tier = 1 | 2 | 3

export function tierConfig(tier: Tier): TierConfig {
  const found = TIERS.find((t) => t.tier === tier)
  if (!found) throw new Error(`Unknown tier: ${tier}`)
  return found
}

export function pointsForTier(tier: Tier): number {
  return tierConfig(tier).points
}

export function tierDurationMs(tier: Tier): number {
  return tierConfig(tier).durationMs
}

export function nextTier(tier: Tier): Tier | null {
  const index = TIERS.findIndex((t) => t.tier === tier)
  const next = TIERS[index + 1]
  return next ? next.tier : null
}
