import type { UserConfig, UserConfigExport } from 'vite'
import { resolve } from 'node:path'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const config: UserConfig = {
  plugins: [Vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ts-maps-vue',
      fileName: 'index',
    },
    outDir: 'dist',
    rollupOptions: {
      external: ['vue'],
      output: {
        format: 'es',
      },
    },
  },
}

const viteConfig: UserConfigExport = defineConfig(config)
export default viteConfig
