import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  resolve: {
    alias: {
      'ts-maps': resolve(__dirname, '../packages/ts-maps/src'),
    },
  },
  server: {
    open: '/samples/basic.html',
  },
})
