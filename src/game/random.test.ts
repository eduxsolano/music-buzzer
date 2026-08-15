import { describe, expect, test } from 'vitest'
import { createRoomCode, shuffle } from '@/game/random'

/** Deterministic stand-in for Math.random, cycling through fixed values. */
function fakeRandom(values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]
}

describe('shuffle', () => {
  test('keeps every item exactly once', () => {
    const result = shuffle(['a', 'b', 'c', 'd'], fakeRandom([0.9, 0.1, 0.5, 0.3]))
    expect([...result].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  test('does not mutate the input', () => {
    const input = ['a', 'b', 'c']
    shuffle(input, fakeRandom([0.5]))
    expect(input).toEqual(['a', 'b', 'c'])
  })

  test('actually reorders when the random source says so', () => {
    expect(shuffle(['a', 'b'], fakeRandom([0.99]))).toEqual(['b', 'a'])
  })
})

describe('createRoomCode', () => {
  test('is four characters long', () => {
    expect(createRoomCode(fakeRandom([0.5]))).toHaveLength(4)
  })

  test('avoids characters that are easy to misread out loud', () => {
    const code = createRoomCode(fakeRandom([0, 0.25, 0.5, 0.75]))
    expect(code).not.toMatch(/[IO01]/)
  })

  test('is uppercase letters only', () => {
    expect(createRoomCode(fakeRandom([0.1, 0.4, 0.7, 0.9]))).toMatch(/^[A-Z]{4}$/)
  })
})
