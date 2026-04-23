# ts-maps benchmarks

Zero-dep micro-benchmarks that measure the hot paths of the core library.
Numbers here are the baseline for regression checks on the vector-tile
and WebGL rendering pipelines.

## Run

From the package root:

```sh
bun run bench
```

Or directly:

```sh
cd packages/ts-maps
bun bench/suites/index.ts
```

From the repo root:

```sh
bun run bench:ts-maps
```

## Output

Each run writes two JSON files:

- `bench/reports/YYYY-MM-DD-HHMMSS.json` — timestamped archive.
- `bench/reports/latest.json` — always overwritten with the most recent

  run; used as the CI diff target.

Reports contain host metadata (CPU, Bun version, commit SHA) plus
per-benchmark `{ p50Us, p95Us, p99Us, opsPerSec, memDeltaKb }`.

Only `latest.json` and the timestamped reports are gitignored; the
rest of `bench/` is checked in.

## Diffing against a baseline

There is no dedicated differ yet (TODO for a later phase). For now,
two reports can be compared manually: run the benches on the baseline
commit, stash `latest.json`, run again on the candidate commit, and
diff the two files. A future phase will add `bench/diff.ts`.

## Anti-flake tips

- Close other heavy apps (browsers, IDE indexers) before running.
- Run three times and take the best numbers — first runs in a fresh

  Bun process are usually slow due to JIT warmup.

- Memory deltas (`memDeltaKb`) are best-effort: they bracket each

  bench with `process.memoryUsage().heapUsed`, but GC timing makes the
  number noisy. Use the timing numbers (p50/p95/p99) as the primary
  signal; treat `memDeltaKb` as directional only.

- Bun's nanosecond clock is used when available. On platforms without

  it, the harness falls back to `performance.now()`, whose precision
  may be coarser — very fast benches can report `0.00us` p50.
