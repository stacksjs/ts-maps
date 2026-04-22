/**
 * TsMap benches — hot paths exercised by pan/zoom/projection.
 *
 * Runs under very-happy-dom; the registrator is triggered from the
 * top-level `suites/index.ts` so that by the time this module evaluates,
 * `document` / `window` exist. Import TsMap lazily inside `runMapSuite`
 * to keep the module evaluation order matching the tests' preload.
 */

import type { BenchmarkResult } from '../runner'
import { Point } from '../../src/core-map/geometry/Point'
import { TsMap } from '../../src/core-map/map/Map'
import { runBenchmark } from '../runner'

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  return container
}

/**
 * Mirror of the `stampSize()` helper from `test/bearing.test.ts`:
 * very-happy-dom does not populate `clientWidth` / `clientHeight` from
 * inline styles, so without stamping the size explicitly, any
 * pixel-math benchmark would project through a (0, 0) viewport.
 */
function stampSize(map: TsMap, width: number, height: number): void {
  map._size = new Point(width, height)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
}

export function runMapSuite(): BenchmarkResult[] {
  const results: BenchmarkResult[] = []

  // Construction — a new TsMap per iteration, including container setup.
  results.push(runBenchmark(
    'map.construct',
    () => ({}),
    () => {
      const container = createContainer()
      const map = new TsMap(container, { center: [0, 0], zoom: 3, zoomAnimation: false, fadeAnimation: false })
      // Keep the map alive for one cycle before the GC reclaims it;
      // this intentionally does not `remove()` to measure the raw
      // construction cost.
      void map
    },
    // Construction is heavier than the micro-benches, so shrink the
    // iteration ceiling and keep the default 1s wall-clock budget.
    { iterations: 2000 },
  ))

  results.push(runBenchmark(
    'map.setView',
    () => {
      const container = createContainer()
      const map = new TsMap(container, { center: [0, 0], zoom: 3, zoomAnimation: false, fadeAnimation: false })
      stampSize(map, 800, 600)
      return { map }
    },
    (ctx) => {
      // Alternate between two targets to avoid the no-op fast path.
      ctx.map.setView([37.7, -122.4], 5)
      ctx.map.setView([40.7, -74.0], 4)
    },
    { iterations: 20_000 },
  ))

  results.push(runBenchmark(
    'map.containerPointToLatLng-bearing0',
    () => {
      const container = createContainer()
      const map = new TsMap(container, { center: [0, 0], zoom: 3, zoomAnimation: false, fadeAnimation: false })
      stampSize(map, 800, 600)
      return { map }
    },
    (ctx) => {
      ctx.map.containerPointToLatLng([400, 300])
    },
  ))

  results.push(runBenchmark(
    'map.containerPointToLatLng-bearing90',
    () => {
      const container = createContainer()
      const map = new TsMap(container, { center: [0, 0], zoom: 3, bearing: 90, zoomAnimation: false, fadeAnimation: false })
      stampSize(map, 800, 600)
      return { map }
    },
    (ctx) => {
      ctx.map.containerPointToLatLng([400, 300])
    },
  ))

  results.push(runBenchmark(
    'map.containerPointToLatLng-pitch45',
    () => {
      const container = createContainer()
      const map = new TsMap(container, { center: [0, 0], zoom: 3, pitch: 45, zoomAnimation: false, fadeAnimation: false })
      stampSize(map, 800, 600)
      return { map }
    },
    (ctx) => {
      ctx.map.containerPointToLatLng([400, 300])
    },
  ))

  results.push(runBenchmark(
    'map.project',
    () => {
      const container = createContainer()
      const map = new TsMap(container, { center: [0, 0], zoom: 3, zoomAnimation: false, fadeAnimation: false })
      stampSize(map, 800, 600)
      return { map }
    },
    (ctx) => {
      // Zoom 12 is a typical tile-loading zoom (city-level).
      ctx.map.project([37.7, -122.4], 12)
    },
  ))

  results.push(runBenchmark(
    'map.fitBounds',
    () => {
      const container = createContainer()
      const map = new TsMap(container, { center: [0, 0], zoom: 3, zoomAnimation: false, fadeAnimation: false })
      stampSize(map, 800, 600)
      return { map }
    },
    (ctx) => {
      ctx.map.fitBounds([[30, -80], [50, -70]])
    },
    { iterations: 20_000 },
  ))

  return results
}
