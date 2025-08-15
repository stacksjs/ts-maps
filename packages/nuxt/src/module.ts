import { addComponentsDir, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

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

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
    addPlugin(resolver.resolve('./runtime/plugin'))

    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      pathPrefix: false,
    })
  },
})
