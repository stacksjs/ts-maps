import { describe, expect, test } from 'bun:test'
import { LiveRouteLayer } from '../src/core-map/layer/LiveRouteLayer'

describe('LiveRouteLayer', () => {
  test('updates existing lines and head without moving a spectator camera', () => {
    const route = new LiveRouteLayer()
    route.update([[[34, -118], [34.1, -118.1]]], [34.1, -118.1])
    const layers = route.getLayers()
    route.update([[[34, -118], [34.2, -118.2]]], [34.2, -118.2])
    expect(route.getLayers()).toEqual(layers)
    expect(route.getBounds().getNorth()).toBe(34.2)
    expect(route._head?.getLatLng().lat).toBe(34.2)
  })
  test('never bridges gaps, invalid GPS points or privacy cuts', () => {
    const route = new LiveRouteLayer()
    route.update([[[34, -118], [34.1, -118.1], [NaN, 0], [34.2, -118.2], [34.3, -118.3]], [[35, -119], [35.1, -119.1]]])
    expect(route._route.getLatLngs().map(segment => segment.length)).toEqual([2, 2, 2])
    expect(route._head).toBeNull()
  })
  test('supports the first fix and immediately removes revoked location', () => {
    const route = new LiveRouteLayer()
    route.update([], [34, -118])
    expect(route.getBounds().getNorth()).toBe(34)
    route.update([], null)
    expect(route._head).toBeNull()
    expect(route._route.isEmpty()).toBe(true)
    expect(route.getBounds().isValid()).toBe(false)
  })
  test('does not retain caller-owned arrays', () => {
    const route = new LiveRouteLayer()
    const point: [number, number] = [34, -118]
    route.update([[point, [35, -119]]], point)
    point[0] = 0
    expect(route.getBounds().getSouth()).toBe(34)
  })
})
