/* eslint-disable no-console, ts/no-top-level-await */

await Bun.$`rm -rf dist`

await Bun.build({
  target: 'browser',
  entrypoints: [
    './src/index.ts',
    // Subpath exports — callers importing from
    // `ts-maps/services`, `ts-maps/style-spec`, etc. only pull in that
    // slice rather than the full index bundle.
    './src/core-map/services/index.ts',
    './src/core-map/style-spec/index.ts',
    './src/core-map/storage/index.ts',
    './src/core-map/geo/index.ts',
    './src/core-map/geometry/index.ts',
    './src/core-map/symbols/index.ts',
  ],
  outdir: './dist',
})

// Flatten `dist/src/*` onto `dist/*` — older Bun.build passes echoed the
// source tree when `./src/index.ts` was an entrypoint. The current Bun
// emits directly into `dist/`, so the flatten is a best-effort no-op.
try {
  await Bun.$`test -d dist/src`.quiet()
  await Bun.$`cp -r dist/src/. dist/`.quiet()
  await Bun.$`rm -rf dist/src`.quiet()
}
catch {
  // no-op — `dist/src/` doesn't exist with newer Bun.build layouts. The
  // tsc step below will error loudly if the JS layout is actually broken.
}

// Emit declarations via tsc directly. `bun-plugin-dtsx` only generates
// top-level entrypoint `.d.ts`s, not the tree of modules they re-export,
// so any consumer importing `TsMap`, `LatLng`, `Marker`, etc. would lose
// types. A straight `tsc --emitDeclarationOnly` pass against
// `tsconfig.build.json` writes the full `core-map/**/*.d.ts` graph into
// `dist/`.
await Bun.$`bunx --bun tsc --project tsconfig.build.json`
