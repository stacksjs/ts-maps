import type { BuildConfig } from 'unbuild'
import { defineBuildConfig } from 'unbuild'

const config: BuildConfig[] = defineBuildConfig({
  entries: [
    // Nuxt module support
    './src/module',
    './src/index',
  ],
  rollup: {
    replace: {
      delimiters: ['', ''],
      values: {
        // Used in development to import directly from source
        'process.env.NODE_ENV': '"production"',
      },
    },
  },
  hooks: {
    'mkdist:entry:options': function (ctx, entry, options) {
      options.addRelativeDeclarationExtensions = false
    },
  },
  externals: ['nuxt', 'vue', 'ts-maps', 'ts-maps-vue'],
})
export default config
