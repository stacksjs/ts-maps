import { addComponent, addImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  /** Component-name prefix. Defaults to `'TsMaps'`. */
  prefix?: string
  /** Inject ts-maps.css automatically via Nuxt's CSS registry. */
  css?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'ts-maps-nuxt',
    configKey: 'tsMaps',
    compatibility: { nuxt: '>=3.12' },
  },
  defaults: {
    prefix: 'TsMaps',
    css: true,
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    if (options.css) {
      const cssPath = resolve('../../ts-maps/src/core-map/ts-maps.css')
      nuxt.options.css = nuxt.options.css ?? []
      if (!nuxt.options.css.includes(cssPath))
        nuxt.options.css.push(cssPath)
    }

    const prefix = options.prefix ?? 'TsMaps'
    const components: [string, string][] = [
      ['Map', 'Map'],
      ['TileLayer', 'TileLayer'],
      ['Marker', 'Marker'],
      ['Popup', 'Popup'],
      ['Source', 'Source'],
      ['Layer', 'Layer'],
    ]

    for (const [source, exportName] of components) {
      addComponent({
        name: `${prefix}${source}`,
        export: exportName,
        filePath: '@ts-maps/vue',
      })
    }

    // Auto-imported composables — `useMap()`, `useMapEvent()`.
    addImports([
      { name: 'useMap', from: '@ts-maps/vue' },
      { name: 'useMapEvent', from: '@ts-maps/vue' },
    ])
  },
})
