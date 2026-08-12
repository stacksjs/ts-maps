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
]
const declarationEntrypoints = entrypoints.map(entrypoint => entrypoint.replace(/^\.\/src\//, ''))

await Bun.$`rm -rf dist`

const result = await Bun.build({
  target: 'browser',
  entrypoints,
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

await Bun.$`bun scripts/verify-package.ts`
