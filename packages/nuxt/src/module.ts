import { addComponentsDir, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'

// Module options TypeScript interface definition
export interface ModuleOptions {
  prefix?: string
}

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
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

export default module
