/**
 * Geometry benches — Point, Bounds, LatLng, LatLngBounds, and the
 * EPSG3857 `latLngToPoint` hot path used by every tile load.
 */

import type { BenchmarkResult } from '../runner'
import { EPSG3857 } from '../../src/core-map/geo/crs/EPSG3857'
import { LatLng } from '../../src/core-map/geo/LatLng'
import { LatLngBounds } from '../../src/core-map/geo/LatLngBounds'
import { Bounds } from '../../src/core-map/geometry/Bounds'
import { Point } from '../../src/core-map/geometry/Point'
import { runBenchmark } from '../runner'

export function runGeometrySuite(): BenchmarkResult[] {
  const results: BenchmarkResult[] = []

  results.push(runBenchmark(
    'geometry.point-construct',
    () => ({}),
    () => {
      // Minimal no-dep construction — the literal path through the
      // numeric branch of Point's constructor.
      // eslint-disable-next-line no-new
      new Point(1, 2)
    },
  ))

  results.push(runBenchmark(
    'geometry.point-add',
    () => ({ a: new Point(3, 4), b: new Point(5, 6) }),
    (ctx) => {
      ctx.a.add(ctx.b)
    },
  ))

  results.push(runBenchmark(
    'geometry.point-distanceTo',
    () => ({ a: new Point(0, 0), b: new Point(300, 400) }),
    (ctx) => {
      ctx.a.distanceTo(ctx.b)
    },
  ))

  results.push(runBenchmark(
    'geometry.bounds-construct',
    () => ({}),
    () => {
      // eslint-disable-next-line no-new
      new Bounds([0, 0], [10, 10])
    },
  ))

  results.push(runBenchmark(
    'geometry.bounds-contains',
    () => ({ b: new Bounds([0, 0], [100, 100]), p: new Point(50, 50) }),
    (ctx) => {
      ctx.b.contains(ctx.p)
    },
  ))

  results.push(runBenchmark(
    'geometry.latlng-distanceTo',
    () => ({
      nyc: new LatLng(40.7128, -74.0060),
      la: new LatLng(34.0522, -118.2437),
    }),
    (ctx) => {
      ctx.nyc.distanceTo(ctx.la)
    },
  ))

  results.push(runBenchmark(
    'geometry.latlngbounds-intersects',
    () => ({
      a: new LatLngBounds([30, -80], [50, -70]),
      b: new LatLngBounds([40, -75], [45, -65]),
    }),
    (ctx) => {
      ctx.a.intersects(ctx.b)
    },
  ))

  results.push(runBenchmark(
    'geometry.epsg3857-latLngToPoint',
    () => ({ ll: new LatLng(40.7128, -74.0060) }),
    (ctx) => {
      // CRS transform: the core projection step for every tile
      // coordinate. Must stay cheap.
      EPSG3857.latLngToPoint(ctx.ll, 5)
    },
  ))

  return results
}
