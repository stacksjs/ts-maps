import { dts } from 'bun-plugin-dtsx'

await Bun.build({
  target: 'browser',
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  plugins: [dts()],
})
