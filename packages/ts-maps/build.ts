import { dts } from 'bun-plugin-dtsx'

await Bun.$`rm -rf dist`

await Bun.build({
  target: 'browser',
  entrypoints: [
    './src/index.ts',
    './src/maps/brasil.ts',
    './src/maps/canada.ts',
    './src/maps/italy.ts',
    './src/maps/spain.ts',
    './src/maps/us-aea-en.ts',
    './src/maps/us-lcc-en.ts',
    './src/maps/us-merc-en.ts',
    './src/maps/us-mill-en.ts',
    './src/maps/world-merc.ts',
    './src/maps/world.ts',
  ],
  outdir: './dist',
  plugins: [dts()],
})

// move all files inside dist/src/* to dist/*
await Bun.$`mv dist/src/* dist/`
await Bun.$`rm -rf dist/src`
