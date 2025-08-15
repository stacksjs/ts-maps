import type { Nuxt } from 'nuxt/schema'
import { resolve } from 'node:path'

export interface TsMapsModuleOptions {
  defaultOptions?: {
    backgroundColor?: string
    zoomOnScroll?: boolean
    zoomButtons?: boolean
    regionsSelectable?: boolean
    markersSelectable?: boolean
  }
}

export default function tsMapsModule(options: TsMapsModuleOptions = {}) {
  return {
    name: 'ts-maps',
    configKey: 'tsMaps',
    setup(moduleOptions: TsMapsModuleOptions, nuxt: Nuxt) {
      const finalOptions = { ...options, ...moduleOptions }

      // Add ts-maps CSS - resolve paths properly
      try {
        const tsMapsCssPath = resolve(nuxt.options.rootDir, 'node_modules/ts-maps/dist/vector-map.css')
        nuxt.options.css.push(tsMapsCssPath)
      }
      catch {
        console.warn('ts-maps CSS not found, skipping...')
      }

      // Add ts-maps-vue CSS - resolve paths properly
      try {
        const tsMapsVueCssPath = resolve(nuxt.options.rootDir, 'node_modules/ts-maps-vue/dist/index.css')
        nuxt.options.css.push(tsMapsVueCssPath)
      }
      catch {
        console.warn('ts-maps-vue CSS not found, skipping...')
      }

      // Add runtime config
      nuxt.options.runtimeConfig.public.tsMaps = {
        defaultOptions: {
          backgroundColor: '#ffffff',
          zoomOnScroll: true,
          zoomButtons: true,
          regionsSelectable: true,
          markersSelectable: true,
          ...finalOptions.defaultOptions,
        },
      }

      // Add plugin to auto-register components
      nuxt.hook('app:resolve', () => {
        nuxt.options.plugins.push({
          src: resolve(__dirname, '../runtime/plugin.client.ts'),
          mode: 'client',
        })
      })

      // Add auto-imports for components
      nuxt.hook('imports:extend', (imports: any[]) => {
        imports.push(
          { name: 'VectorMap', from: 'ts-maps-nuxt' },
          { name: 'UnitedStates', from: 'ts-maps-nuxt' },
          { name: 'Canada', from: 'ts-maps-nuxt' },
        )
      })
    },
  }
}
