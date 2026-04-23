/* eslint-disable no-console, ts/no-top-level-await */

await Bun.$`rm -rf dist`

await Bun.build({
  target: 'browser',
  entrypoints: [
    './src/index.ts',
    './src/analytics/index.ts',
    './src/maps/brasil.ts',
    './src/maps/canada.ts',
    './src/maps/iraq.ts',
    './src/maps/italy.ts',
    './src/maps/russia.ts',
    './src/maps/spain.ts',
    './src/maps/us-aea-en.ts',
    './src/maps/us-lcc-en.ts',
    './src/maps/us-merc-en.ts',
    './src/maps/us-mill-en.ts',
    './src/maps/world-merc.ts',
    './src/maps/world.ts',
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

// Flatten `dist/src/*` onto `dist/*` — Bun.build echoes the source tree
// when `./src/index.ts` is an entrypoint, but published consumers expect
// `dist/index.js` at the root.
try {
  await Bun.$`cp -r dist/src/* dist/`
  await Bun.$`rm -rf dist/src`
}
catch {
  // no-op — handled by the tsc step below which will error loudly if
  // the JS layout is actually broken.
}

// Emit declarations via tsc directly. `bun-plugin-dtsx` only generates
// top-level entrypoint `.d.ts`s, not the tree of modules they re-export,
// so any consumer importing `TsMap`, `LatLng`, `Marker`, etc. would lose
// types. A straight `tsc --emitDeclarationOnly` pass against
// `tsconfig.build.json` writes the full `core-map/**/*.d.ts` graph into
// `dist/`.
await Bun.$`bunx --bun tsc --project tsconfig.build.json`
