import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TsMapsVue',
      fileName: 'index',
    },
    rollupOptions: {
      external: ['vue', 'ts-maps'],
      output: {
        globals: {
          'vue': 'Vue',
          'ts-maps': 'TsMaps',
        },
      },
    },
  },
})
