import { describe, expect, test } from 'bun:test'
import { Map } from '../src/core-map'

describe('Map', () => {
  test('can be instantiated on a div and setView updates zoom/loaded state', () => {
    const container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)

    const map = new Map(container)
    map.setView([0, 0], 5)

    expect(map._zoom).toBe(5)
    expect(map._loaded).toBe(true)
  })
})
