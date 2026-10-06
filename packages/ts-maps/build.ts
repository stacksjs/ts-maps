/* eslint-disable no-console, ts/no-top-level-await */
import { dts } from 'bun-plugin-dtsx'

const entrypoints = [
  './src/index.ts',
  './src/core-map/services/index.ts',
  './src/core-map/style-spec/index.ts',
  './src/core-map/storage/index.ts',
  './src/core-map/geo/index.ts',
  './src/core-map/geometry/index.ts',
  './src/core-map/symbols/index.ts',
  './src/core-map/static/index.ts',
  './src/core-map/pmtiles/index.ts',
  // Cloudflare Workers: bundled for the browser target on purpose, since a
  // Worker has the Web platform and nothing of Node's or Bun's.
  './src/worker/index.ts',
]
// Server-only: `ts-maps/gazetteer` opens SQLite through `bun:sqlite` and
// `ts-maps/server` reads files and S3 objects, so they are bundled for Bun,
// apart from the browser entry points above.
const serverEntrypoints = [
  './src/gazetteer/index.ts',
  './src/server/index.ts',
]
const declarationEntrypoints = [...entrypoints, ...serverEntrypoints]
  .map(entrypoint => entrypoint.replace(/^\.\/src\//, ''))

await Bun.$`rm -rf dist`

const result = await Bun.build({
  target: 'browser',
  entrypoints,
  // Pin the root: Bun otherwise derives it from the module graph, and one
  // entry's imports can shift every output path under `dist/src/`.
  root: './src',
  outdir: './dist',
  plugins: [dts({
    root: './src',
    outdir: './dist',
    tsconfigPath: './tsconfig.build.json',
    entrypoints: declarationEntrypoints,
    keepComments: true,
  })],
})

if (!result.success) {
  for (const log of result.logs)
    console.error(log)
  throw new Error('ts-maps build failed')
}

const serverResult = await Bun.build({
  target: 'bun',
  entrypoints: serverEntrypoints,
  root: './src',
  outdir: './dist',
})

if (!serverResult.success) {
  for (const log of serverResult.logs)
    console.error(log)
  throw new Error('ts-maps server build failed')
}

await Bun.$`bun scripts/verify-package.ts`
