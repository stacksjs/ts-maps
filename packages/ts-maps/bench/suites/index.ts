/**
 * Benchmark entry point. Registers very-happy-dom (for the map suite),
 * runs each suite sequentially, prints a summary table, and writes
 * a JSON report.
 *
 * Run with: `bun run bench` (from the ts-maps package), or
 * `bun bench/suites/index.ts` directly.
 *
 * `no-console` is disabled throughout — a CLI entry point is the one
 * place in this codebase where `console.log` is the point.
 */

import { GlobalRegistrator } from 'very-happy-dom'

// Register the DOM shim before any `src/core-map/map` modules evaluate —
// the Map module indirectly touches globals on load.
GlobalRegistrator.register()

// Imports below rely on the DOM being registered — keep them after the
// `GlobalRegistrator.register()` call above.
/* eslint-disable import/first */
import type { BenchmarkResult } from '../runner'
import { collectMeta, formatTable, writeReport } from '../report'
import { runGeometrySuite } from './geometry.bench'
import { runMapSuite } from './map.bench'
import { runPbfSuite } from './pbf.bench'
/* eslint-enable import/first */

async function main(): Promise<void> {
  const wallStart = performance.now()
  const all: BenchmarkResult[] = []

  /* eslint-disable no-console */
  console.log('ts-maps benchmarks\n')

  console.log('[1/3] geometry')
  all.push(...runGeometrySuite())

  console.log('[2/3] map')
  all.push(...runMapSuite())

  console.log('[3/3] pbf')
  all.push(...runPbfSuite())

  const wallEnd = performance.now()
  const wallMs = wallEnd - wallStart

  const meta = collectMeta()
  const report = { meta, results: all }
  const { reportPath, latestPath } = writeReport(report)

  console.log(`\n${formatTable(all)}`)
  console.log('')
  console.log(`Host   : ${meta.cpuModel} (${meta.cpuCount} cores, ${meta.totalMemGb} GB)`)
  console.log(`Runtime: bun ${meta.bunVersion ?? '?'} / node ${meta.nodeVersion ?? '?'} on ${meta.platform}/${meta.arch}`)
  if (meta.commitSha)
    console.log(`Commit : ${meta.commitSha}`)
  console.log(`Wall   : ${(wallMs / 1000).toFixed(2)}s`)
  console.log('')
  console.log(`Report : ${reportPath}`)
  console.log(`Latest : ${latestPath}`)
  /* eslint-enable no-console */
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
