// @ts-expect-error latest dtsx has type issues atm
import { dts } from 'bun-plugin-dtsx'

await Bun.build({
  target: 'bun',
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  plugins: [dts()],
})
