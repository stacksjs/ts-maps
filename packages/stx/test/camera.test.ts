import { describe, expect, test } from 'bun:test'
import { mapOptionsFrom } from '../src/runtime'

describe('map camera limits', () => {
  test('maxPitch and minPitch reach the map, and are left to its defaults when not given', () => {
    const limited = mapOptionsFrom({ pitch: 60, maxPitch: 75, minPitch: 20 })
    expect(limited.maxPitch).toBe(75)
    expect(limited.minPitch).toBe(20)

    const plain = mapOptionsFrom({})
    expect('maxPitch' in plain).toBe(false)
    expect('minPitch' in plain).toBe(false)
  })
})
