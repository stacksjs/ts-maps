// Shared harness for the Leaflet spec regression corpus.
//
// This module re-exports everything the ported Leaflet spec suites need,
// plus a handful of tiny helpers (a `createSpy` closure-spy that replaces
// sinon.spy, and approximate comparators that mirror SpecHelper.js's
// `near` / `nearLatLng` custom Chai assertions).

export {
  Bounds,
  Class,
  Evented,
  FeatureGroup,
  GeoJSON,
  Layer,
  LayerGroup,
  LineUtil,
  Marker,
  PolyUtil,
  Point,
  Polygon,
  Polyline,
  Transformation,
  Util,
  toBounds,
  toLatLng,
  toLatLngBounds,
  toPoint,
  toTransformation,
} from '../../src/core-map'

export { CRS, EarthCRS, EPSG3395, EPSG3857, EPSG4326, SimpleCRS } from '../../src/core-map/geo/crs/index'
export { LatLng } from '../../src/core-map/geo/LatLng'
export { LatLngBounds } from '../../src/core-map/geo/LatLngBounds'
export * as Projection from '../../src/core-map/geo/projection/index'
export { TsMap } from '../../src/core-map/map/index'

import { expect } from 'bun:test'
import { LatLng } from '../../src/core-map/geo/LatLng'
import { Point } from '../../src/core-map/geometry/Point'

export interface Spy<A extends any[] = any[]> {
  (...args: A): void
  called: boolean
  callCount: number
  calls: A[]
  calledWith: (expected: any) => boolean
  calledOnce: boolean
}

// Tiny closure-based spy that mirrors the subset of sinon.spy used by the
// Leaflet specs (called / callCount / calls / calledWith / calledOnce).
export function createSpy<A extends any[] = any[]>(): Spy<A> {
  const fn = ((...args: A) => {
    fn.called = true
    fn.callCount++
    fn.calls.push(args)
  }) as Spy<A>
  fn.called = false
  fn.callCount = 0
  fn.calls = []
  fn.calledWith = (expected: any) => {
    return fn.calls.some((args) => {
      return args.length >= 1 && deepIncludes(args[0], expected)
    })
  }
  Object.defineProperty(fn, 'calledOnce', {
    get(): boolean {
      return fn.callCount === 1
    },
  })
  return fn
}

// Loose `calledWith` — the argument must at least contain every key/value in
// `expected`. Used only for the addEventParent event-shape assertions.
function deepIncludes(actual: any, expected: any): boolean {
  if (actual === expected)
    return true
  if (actual === null || expected === null)
    return false
  if (typeof actual !== 'object' || typeof expected !== 'object')
    return false
  for (const k of Object.keys(expected)) {
    if (!deepIncludes(actual[k], expected[k]))
      return false
  }
  return true
}

// Mirrors SpecHelper.js's `near` — assert x/y are within `delta` pixels.
export function expectNear(actual: Point | { x: number, y: number }, expected: [number, number] | { x: number, y: number }, delta: number = 1): void {
  const target = Array.isArray(expected) ? { x: expected[0], y: expected[1] } : expected
  expect(actual.x).toBeGreaterThanOrEqual(target.x - delta)
  expect(actual.x).toBeLessThanOrEqual(target.x + delta)
  expect(actual.y).toBeGreaterThanOrEqual(target.y - delta)
  expect(actual.y).toBeLessThanOrEqual(target.y + delta)
}

// Mirrors SpecHelper.js's `nearLatLng`.
export function expectNearLatLng(actual: LatLng | { lat: number, lng: number, alt?: number }, expected: [number, number] | [number, number, number] | { lat: number, lng: number, alt?: number }, delta: number = 1e-4): void {
  const target = new LatLng(expected as any)
  expect(actual.lat).toBeGreaterThanOrEqual(target.lat - delta)
  expect(actual.lat).toBeLessThanOrEqual(target.lat + delta)
  expect(actual.lng).toBeGreaterThanOrEqual(target.lng - delta)
  expect(actual.lng).toBeLessThanOrEqual(target.lng + delta)
  expect(actual.alt).toEqual(target.alt)
}
