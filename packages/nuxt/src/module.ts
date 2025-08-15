import {
  addImportsDir,
  addPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { name, version } from '../package.json'

declare module '@nuxt/schema' {
  interface AppConfigInput {
    /* Readonly: only for module use  */
    __tsMaps?: Readonly<{
      defaultOptions: {
        backgroundColor: string
        zoomOnScroll: boolean
        zoomButtons: boolean
        regionsSelectable: boolean
        markersSelectable: boolean
      }
    }>
  }
}

export interface ModuleOptions {
  /**
   * Default options for ts-maps components.
   * @example ```vue
   * <script setup>
   * const mapOptions = {
   *   backgroundColor: '#f0f0f0',
   *   zoomOnScroll: true,
   *   zoomButtons: true,
   *   regionsSelectable: true,
   *   markersSelectable: true
   * }
   * </script>
   * <template>
   *   <VectorMap :options="mapOptions" />
   * </template>
   * ```
   */
  defaultOptions?: {
    backgroundColor?: string
    zoomOnScroll?: boolean
    zoomButtons?: boolean
    regionsSelectable?: boolean
    markersSelectable?: boolean
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name,
    version,
    configKey: 'tsMaps',
  },
  defaults: {
    defaultOptions: {
      backgroundColor: '#ffffff',
      zoomOnScroll: true,
      zoomButtons: true,
      regionsSelectable: true,
      markersSelectable: true,
    },
  },
  setup(opts, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Merge options to app config to be used in runtime
    nuxt.options.appConfig = {
      ...nuxt.options.appConfig,
      __tsMaps: {
        defaultOptions: opts?.defaultOptions ?? {
          backgroundColor: '#ffffff',
          zoomOnScroll: true,
          zoomButtons: true,
          regionsSelectable: true,
          markersSelectable: true,
        },
      },
    }

    // Add ts-maps CSS
    try {
      const tsMapsCssPath = resolver.resolve('../../ts-maps/dist/vector-map.css')
      nuxt.options.css.push(tsMapsCssPath)
    }
    catch {
      console.warn('ts-maps CSS not found, skipping...')
    }

    // Add ts-maps-vue CSS
    try {
      const tsMapsVueCssPath = resolver.resolve('../../ts-maps-vue/dist/index.css')
      nuxt.options.css.push(tsMapsVueCssPath)
    }
    catch {
      console.warn('ts-maps-vue CSS not found, skipping...')
    }

    // Add runtime config
    nuxt.options.runtimeConfig.public.tsMaps = {
      defaultOptions: opts?.defaultOptions ?? {
        backgroundColor: '#ffffff',
        zoomOnScroll: true,
        zoomButtons: true,
        regionsSelectable: true,
        markersSelectable: true,
      },
    }

    // Add plugin to auto-register components
    addPlugin(resolver.resolve('./runtime/plugin.client'))

    // Add auto-imports for components
    addImportsDir(resolver.resolve('./runtime/composables'))

    // Register types
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({
        path: resolver.resolve('./runtime/components.d.ts'),
      })
    })
  },
})
