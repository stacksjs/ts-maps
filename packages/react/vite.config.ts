import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TSMapsReact',
      formats: ['es', 'umd', 'cjs'],
      fileName: (format) => {
        if (format === 'es')
          return 'index.mjs'
        if (format === 'cjs')
          return 'index.js'
        return `index.${format}.js`
      },
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
})
