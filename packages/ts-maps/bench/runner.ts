/**
 * ts - maps benchmark runner.
 *
 * Zero-dep harness: measure a function under a wall-clock budget,
 * collect per-iteration timings, compute p50/p95/p99, report a
 * best-effort heap delta. Kept intentionally small; stats math is
 * inlined so there's nothing to depend on.
 *
 * Per-iteration timing uses `Bun.nanoseconds()` when available
 * (sub-microsecond resolution); otherwise `performance.now()` which
 * is usually millisecond-precise in plain Node / happy-dom contexts.
 */

export interface BenchmarkOptions {
  // Warm-up iterations run before the measured loop. Default 10.
  warmup?: number
  // Hard cap on measured iterations. Default 200_000 (upper safety).
  iterations?: number
  // Wall-clock budget for the measured loop in milliseconds. Default 1000.
  // The loop stops as soon as this is exceeded, even mid-iteration count.
  budgetMs?: number
}

export interface BenchmarkResult {
  name: string
  iterations: number
  totalMs: number
  meanUs: number
  p50Us: number
  p95Us: number
  p99Us: number
  opsPerSec: number
  // Best-effort heap delta around the bench (bracketed). Noisy — see
  // `memNoisy` flag. Populated when `process.memoryUsage` is callable.
  memDeltaKb?: number
  // True whenever a memory delta was recorded — serves as a reminder
  // to consumers that the number is best-effort, not precise.
  memNoisy?: boolean
}

// Prefer Bun's nanosecond clock when available. Falls back to
// `performance.now()` (millisecond precision in most environments).
type NowFn = () => number

function makeNow(): { now: NowFn, unitUs: number } {
  const bunAny: any = typeof Bun !== 'undefined' ? Bun : null
  if (bunAny && typeof bunAny.nanoseconds === 'function') {
    const ns: () => bigint = bunAny.nanoseconds
    // Return microseconds as a float to avoid BigInt math in the hot loop.
    return {
      now: () => Number(ns()) / 1000,
      unitUs: 1,
    }
  }
  // performance.now() returns milliseconds. We convert to microseconds so
  // the rest of the pipeline works in a single unit.
  return {
    now: () => performance.now() * 1000,
    unitUs: 1,
  }
}

const clock = makeNow()

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0)
    return 0
  if (sorted.length === 1)
    return sorted[0]
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi)
    return sorted[lo]
  const frac = pos - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

function readHeapKb(): number | undefined {
  try {
    const mu: any = typeof process !== 'undefined' && process.memoryUsage
      ? process.memoryUsage()
      : undefined
    if (!mu)
      return undefined
    return Math.round(mu.heapUsed / 1024)
  }
  catch {
    return undefined
  }
}

/**
 * Run a benchmark. `setup` builds a per-bench context once; `iter` is
 * invoked repeatedly with that context and is what gets measured.
 *
 * Contract: `iter` is measured end-to-end per call. Keep it cheap; the
 * harness calls it many times. Return values are ignored.
 */
export function runBenchmark<T>(
  name: string,
  setup: () => T,
  iter: (ctx: T) => void,
  opts?: BenchmarkOptions,
): BenchmarkResult {
  const warmup = opts?.warmup ?? 10
  const maxIter = opts?.iterations ?? 200_000
  const budgetMs = opts?.budgetMs ?? 1000

  const ctx = setup()

  // Warmup — no timings collected.
  for (let i = 0; i < warmup; i++)
    iter(ctx)

  const timings: number[] = []

  const heapBefore = readHeapKb()
  const loopStart = clock.now()
  const loopDeadline = loopStart + budgetMs * 1000 // budget in microseconds

  let count = 0
  while (count < maxIter) {
    const t0 = clock.now()
    iter(ctx)
    const t1 = clock.now()
    timings.push(t1 - t0)
    count++
    // Check the wall-clock budget. We check after each iteration so
    // short-but-many benches still finish promptly.
    if (t1 >= loopDeadline)
      break
  }

  const loopEnd = clock.now()
  const heapAfter = readHeapKb()

  const totalMs = (loopEnd - loopStart) / 1000
  const sorted = timings.slice().sort((a, b) => a - b)
  const sum = timings.reduce((acc, v) => acc + v, 0)
  const meanUs = count > 0 ? sum / count : 0

  const result: BenchmarkResult = {
    name,
    iterations: count,
    totalMs,
    meanUs,
    p50Us: quantileSorted(sorted, 0.5),
    p95Us: quantileSorted(sorted, 0.95),
    p99Us: quantileSorted(sorted, 0.99),
    opsPerSec: totalMs > 0 ? (count * 1000) / totalMs : 0,
  }

  if (heapBefore !== undefined && heapAfter !== undefined) {
    result.memDeltaKb = heapAfter - heapBefore
    result.memNoisy = true
  }

  return result
}
