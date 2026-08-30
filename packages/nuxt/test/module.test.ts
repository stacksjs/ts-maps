import { beforeEach, describe, expect, mock, test } from 'bun:test'

// A Nuxt module is not a component — it is a setup function that registers
// things with Nuxt. Running it for real would mean booting Nuxt, so `@nuxt/kit`
// is replaced with a recorder and the module's own setup is called directly.
// What that covers is everything the module actually contains: which
// components it registers, under what names, which composables it
// auto-imports, and whether the stylesheet is injected. Nuxt's own plumbing is
// Nuxt's to test.
//
// Before this, the package had a typecheck and nothing else — which would not
// have noticed a component dropped from the list, a prefix applied to some
// names and not others, or the CSS being pushed twice.

interface RegisteredComponent {
  name: string
  export: string
  filePath: string
}

const registered: RegisteredComponent[] = []
const imported: Array<{ name: string, from: string }> = []

mock.module('@nuxt/kit', () => ({
  // The real one wraps setup in compatibility checks and module bookkeeping
  // that need a live Nuxt. Handing the definition back lets the test call
  // setup with options it resolves itself.
  defineNuxtModule: (definition: any) => definition,
  addComponent: (component: RegisteredComponent) => {
    registered.push(component)
  },
  addImports: (imports: Array<{ name: string, from: string }>) => {
    imported.push(...imports)
  },
  createResolver: (base: string) => ({
    resolve: (path: string) => new URL(path, base).pathname,
  }),
}))

const { default: module } = await import('../src/module')

/**
 * The Vue binding's source, not its package entry.
 *
 * What these tests are guarding against is the two packages drifting apart as
 * they are edited separately, and the package entry points at a build — which
 * can be stale, or absent, and would then report a mismatch that is not real.
 * The specifier is held in a variable so the sources are not pulled into this
 * package's TypeScript program, which typechecks under different settings.
 */
const VUE_SOURCE = '../../vue/src/index'

function vueBinding(): Promise<Record<string, unknown>> {
  return import(VUE_SOURCE)
}

interface FakeNuxt {
  options: { css?: string[] }
}

function run(options: Record<string, unknown> = {}, nuxt: FakeNuxt = { options: {} }): FakeNuxt {
  const defaults = (module as any).defaults ?? {}
  ;(module as any).setup({ ...defaults, ...options }, nuxt)
  return nuxt
}

beforeEach(() => {
  registered.length = 0
  imported.length = 0
})

describe('module metadata', () => {
  test('declares the config key apps write against', () => {
    expect((module as any).meta.configKey).toBe('tsMaps')
    expect((module as any).meta.name).toBe('ts-maps-nuxt')
  })

  test('defaults are what an app gets with no configuration', () => {
    expect((module as any).defaults).toEqual({ prefix: 'TsMaps', css: true })
  })
})

describe('component registration', () => {
  test('registers the whole Vue surface, prefixed', () => {
    run()

    const names = registered.map(c => c.name)
    expect(names).toEqual([
      'TsMapsMap',
      'TsMapsTileLayer',
      'TsMapsMarker',
      'TsMapsPopup',
      'TsMapsSource',
      'TsMapsLayer',
      'TsMapsZoomControl',
      'TsMapsNavigationControl',
      'TsMapsGeocoderControl',
      'TsMapsFullscreenControl',
      'TsMapsLocateControl',
      'TsMapsScaleControl',
      'TsMapsAttributionControl',
    ])
  })

  test('every component resolves to a real export of the Vue binding', async () => {
    run()
    const vue = await vueBinding()

    for (const component of registered) {
      expect(component.filePath).toBe('@ts-maps/vue')
      // A name that does not exist would fail at runtime in an app and pass
      // every check here — which is exactly the kind of drift a binding
      // accumulates when the packages are edited separately.
      expect(vue).toHaveProperty(component.export)
    }
  })

  test('a custom prefix applies to every component, not some', () => {
    run({ prefix: 'Geo' })
    expect(registered.every(c => c.name.startsWith('Geo'))).toBe(true)
    expect(registered.map(c => c.name)).toContain('GeoMap')
  })

  test('an empty prefix leaves the bare names', () => {
    run({ prefix: '' })
    expect(registered.map(c => c.name)).toContain('Map')
  })

  test('LayersControl is deliberately absent', () => {
    // It takes dictionaries of live layer instances, so it stays imperative
    // via `useMap()`. Registering it would offer a component that cannot
    // express its own props.
    run()
    expect(registered.map(c => c.name)).not.toContain('TsMapsLayersControl')
  })
})

describe('composables', () => {
  test('auto-imports the two the binding exports', async () => {
    run()
    expect(imported).toEqual([
      { name: 'useMap', from: '@ts-maps/vue' },
      { name: 'useMapEvent', from: '@ts-maps/vue' },
    ])

    const vue = await vueBinding()
    for (const composable of imported)
      expect(typeof (vue as any)[composable.name]).toBe('function')
  })
})

describe('stylesheet', () => {
  test('is added to the app css by default', () => {
    const nuxt = run()
    expect(nuxt.options.css?.length).toBe(1)
    expect(nuxt.options.css?.[0]).toContain('ts-maps.css')
  })

  test('opting out leaves the css list alone', () => {
    const nuxt = run({ css: false })
    expect(nuxt.options.css).toBeUndefined()
  })

  test('an existing css list is appended to, not replaced', () => {
    const nuxt = run({}, { options: { css: ['~/assets/app.css'] } })
    expect(nuxt.options.css?.[0]).toBe('~/assets/app.css')
    expect(nuxt.options.css?.length).toBe(2)
  })

  test('running twice does not add the stylesheet twice', () => {
    // Nuxt may call a module's setup more than once across a dev restart, and
    // a duplicated stylesheet is a duplicated cascade.
    const nuxt: FakeNuxt = { options: {} }
    run({}, nuxt)
    run({}, nuxt)
    expect(nuxt.options.css?.length).toBe(1)
  })
})
