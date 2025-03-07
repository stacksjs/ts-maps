import { dts } from 'bun-plugin-dtsx'

const resp = await Bun.build({
  target: 'bun',
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  plugins: [dts()],
})

const resp2 = await Bun.build({
  target: 'bun',
  entrypoints: ['./bin/cli.ts'],
  outdir: './dist',
  plugins: [dts()],
})
