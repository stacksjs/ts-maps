/**
 * Extrusion benches — a geojson source of about 3,100 polygons stood up as
 * `fill-extrusion` prisms, the size of a map of every US county.
 *
 * Three costs matter to a map like that: building the meshes (once per
 * style or data change), a feature-state change (every time the pointer
 * moves on to another prism), and finding the prism under the pointer (every
 * pointer move). The GPU's part is stubbed out, as in the tests; what is
 * timed is the work done on the main thread before a frame is drawn.
 */

import type { BenchmarkResult } from '../runner'
import { collection, extrusionHarness, square } from '../../test/helpers/extrusion'
import { runBenchmark } from '../runner'

export async function runExtrusionSuite(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []

  // 56 × 56 cells inside grid tile (4,4) at zoom 4: 45° of longitude and
  // 41° of latitude south-east of the origin.
  const side = 56
  const cells: any[] = []
  const ids: string[] = []
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const id = `c${row}-${col}`
      ids.push(id)
      cells.push(square(id, 1 + col * 0.75, -40 + row * 0.7, 0.6, { votes: 1000 + ((row * 31 + col * 17) % 97) * 9000 }))
    }
  }

  const h = extrusionHarness(
    collection(...cells),
    {
      'fill-extrusion-height': ['get', 'votes'],
      'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#ffffff', ['interpolate', ['linear'], ['get', 'votes'], 0, '#b2182b', 900000, '#2166ac']],
    },
    { pitch: 60 },
  )
  await h.show(4, 4, 4)
  h.draw()

  results.push(runBenchmark(
    `extrusion.mesh-${ids.length}`,
    () => ({}),
    () => {
      h.layer._invalidateMeshes()
      h.draw()
    },
    { budgetMs: 2000, warmup: 2 },
  ))

  results.push(runBenchmark(
    `extrusion.feature-state-${ids.length}`,
    () => ({ n: 0 }),
    (ctx) => {
      // Hover moves from one prism to the next: one cleared, one set.
      const from = ids[ctx.n % ids.length]!
      const to = ids[(ctx.n + 1) % ids.length]!
      ctx.n++
      h.state[from] = {}
      h.layer._featureStateChanged(from)
      h.state[to] = { hover: true }
      h.layer._featureStateChanged(to)
    },
  ))

  const point = h.map.latLngToContainerPoint([-12, 8], 200000)
  results.push(runBenchmark(
    `extrusion.pick-${ids.length}`,
    () => ({}),
    () => {
      h.layer.queryRenderedFeatures(point)
    },
  ))

  return results
}
