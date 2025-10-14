import type { UserConfig, UserConfigExport } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const config: UserConfig = {
  plugins: [Vue()],
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'ts-maps-vue',
      fileName: 'index',
    },
    outDir: 'dist',
    rollupOptions: {
      external: ['vue'],
      output: {
        format: 'es',
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
}

const viteConfig: UserConfigExport = defineConfig(config)
export default viteConfig
