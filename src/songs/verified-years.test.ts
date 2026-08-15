import { describe, expect, test } from 'vitest'
import { parseVerifiedYears, resolveYear, unknownVerifiedIds, verifiedYearsById } from '@/songs/verified-years'
import type { Song } from '@/game/types'

const valid = { id: 'billie-jean', year: 1982, note: 'Original hand-curated deck seed' }

describe('parseVerifiedYears', () => {
  test('accepts a well-formed list', () => {
    expect(parseVerifiedYears([valid])).toEqual([valid])
  })

  test('accepts an empty list', () => {
    expect(parseVerifiedYears([])).toEqual([])
  })

  test('rejects a non-array', () => {
    expect(() => parseVerifiedYears({})).toThrow(/array/i)
  })

  test('rejects a missing id', () => {
    expect(() => parseVerifiedYears([{ ...valid, id: undefined }])).toThrow(/id/i)
  })

  test('rejects a non-integer year', () => {
    expect(() => parseVerifiedYears([{ ...valid, year: 1982.5 }])).toThrow(/year/i)
  })

  test('rejects a zero year — 0 means "unverified", never a value to protect', () => {
    expect(() => parseVerifiedYears([{ ...valid, year: 0 }])).toThrow(/year/i)
  })

  test('rejects a negative year', () => {
    expect(() => parseVerifiedYears([{ ...valid, year: -5 }])).toThrow(/year/i)
  })

  test('rejects a missing note — every entry must say why it is trusted', () => {
    expect(() => parseVerifiedYears([{ ...valid, note: '' }])).toThrow(/note/i)
  })

  test('rejects duplicate ids', () => {
    expect(() => parseVerifiedYears([valid, valid])).toThrow(/duplicate.*billie-jean/is)
  })
})

describe('verifiedYearsById', () => {
  test('indexes entries by id', () => {
    const map = verifiedYearsById([valid])
    expect(map.get('billie-jean')).toEqual(valid)
    expect(map.get('missing')).toBeUndefined()
  })
})

describe('unknownVerifiedIds', () => {
  const songs: Song[] = [
    { id: 'billie-jean', videoId: 'Zi_XLOBDo_Y', title: 'Billie Jean', artist: 'Michael Jackson', artists: ['Michael Jackson'], year: 1982, startSeconds: 30 },
  ]

  test('returns nothing when every verified id matches a song in the deck', () => {
    expect(unknownVerifiedIds([valid], songs)).toEqual([])
  })

  test('flags a verified id with no matching song — a stale entry', () => {
    const stale = { id: 'removed-song', year: 1999, note: 'no longer in the deck' }
    expect(unknownVerifiedIds([valid, stale], songs)).toEqual(['removed-song'])
  })
})

describe('resolveYear', () => {
  test('passes the lookup result straight through when the song is not on the verified list', () => {
    expect(resolveYear(undefined, 0, 1991)).toEqual({ year: 1991, restored: false, disagreement: false })
    expect(resolveYear(undefined, 0, 0)).toEqual({ year: 0, restored: false, disagreement: false })
  })

  test('keeps the verified year when the lookup agrees', () => {
    expect(resolveYear(valid, 1982, 1982)).toEqual({ year: 1982, restored: false, disagreement: false })
  })

  test('keeps the verified year and does not flag a disagreement when the lookup finds nothing', () => {
    expect(resolveYear(valid, 1982, 0)).toEqual({ year: 1982, restored: false, disagreement: false })
  })

  test('keeps the verified year and flags a disagreement when the lookup confidently disagrees', () => {
    expect(resolveYear(valid, 1982, 2025)).toEqual({ year: 1982, restored: false, disagreement: true })
  })

  test('restores the verified year and reports it when the stored value had drifted away from it', () => {
    expect(resolveYear(valid, 0, 0)).toEqual({ year: 1982, restored: true, disagreement: false })
  })

  test('restores the verified year even when the drifted stored value happens to equal the fresh lookup', () => {
    // Guards against a shortcut that only compares lookupYear to verified.year:
    // the stored value (2025, some other overwrite) must still be corrected to
    // 1982 even though the lookup this run happens to (wrongly) agree with it.
    expect(resolveYear(valid, 2025, 2025)).toEqual({ year: 1982, restored: true, disagreement: true })
  })
})
