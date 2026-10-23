import { describe, expect, test } from 'bun:test'
import { mapOptionsFrom } from '../src/runtime'

describe('map projection', () => {
  test('the STX component forwards a globe instead of silently drawing a flat map', () => {
    expect(mapOptionsFrom({ projection: 'globe' }).projection).toBe('globe')
    expect(mapOptionsFrom({ projection: 'mercator' }).projection).toBe('mercator')
    expect(mapOptionsFrom({}).projection).toBeUndefined()
  })
})
