import { describe, expect, test } from 'bun:test'
import { Marker, TsMap } from '../src/core-map'

describe('Marker', () => {
  test('has _icon defined after being added to the map', () => {
    const container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)

    const map = new TsMap(container)
    map.setView([0, 0], 5)

    const marker = new Marker([0, 0])
    marker.addTo(map)

    expect(marker._icon).toBeDefined()
    expect(marker._icon).not.toBeNull()
  })

  test('a draggable marker can be added to the map', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const map = new TsMap(container)
    map.setView([0, 0], 5)

    // The drag handler's marker used to be a class field, reset to undefined
    // after construction, so adding any draggable marker threw.
    const marker = new Marker([0, 0], { draggable: true })
    expect(() => marker.addTo(map)).not.toThrow()
    expect(marker.dragging?._marker).toBe(marker)
  })
})
