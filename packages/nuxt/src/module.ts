import { addComponentsDir, createResolver, defineNuxtModule } from '@nuxt/kit'

// Module options TypeScript interface definition
export interface ModuleOptions {
  prefix?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'ts-maps-nuxt',
    configKey: 'tsMapsNuxt',
  },
  // Default configuration options of the Nuxt module
  defaults: {
    prefix: 'TsMaps',
  },
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)

    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      pathPrefix: false,
    })
  },
})
