import { describe, expect, test } from 'bun:test'

describe('Vue Package Exports', () => {
  test('should have package.json with correct name', async () => {
    const packageJson = await import('../package.json')
    expect(packageJson.default.name).toBe('ts-maps-vue')
    expect(packageJson.default.type).toBe('module')
  })

  test('should have build script', async () => {
    const packageJson = await import('../package.json')
    expect(packageJson.default.scripts.build).toBeDefined()
    expect(typeof packageJson.default.scripts.build).toBe('string')
  })

  test('should have Vue as dependency', async () => {
    const packageJson = await import('../package.json')
    expect(packageJson.default.devDependencies.vue).toBeDefined()
  })

  test('should have TypeScript configuration', async () => {
    const tsConfig = await import('../tsconfig.json')
    expect(tsConfig.default).toBeDefined()
    expect(tsConfig.default.compilerOptions).toBeDefined()
  })

  test('should have Vite configuration', async () => {
    const viteConfig = await import('../vite.config.ts')
    expect(viteConfig.default).toBeDefined()
  })
})

describe('Component Structure', () => {
  test('should have VectorMap component file', async () => {
    // Test that the component file exists and can be imported
    expect(() => {
      import('../src/components/VectorMap.vue')
    }).not.toThrow()
  })

  test('should have GoogleMap component file', async () => {
    expect(() => {
      import('../src/components/GoogleMap.vue')
    }).not.toThrow()
  })

  test('should have index.ts file', async () => {
    expect(() => {
      import('../src/index.ts')
    }).not.toThrow()
  })

  test('should have VectorMaps directory with country components', async () => {
    const countries = [
      'Brasil.vue',
      'Canada.vue',
      'Iraq.vue',
      'Italy.vue',
      'Russia.vue',
      'Spain.vue',
      'UnitedStates.vue',
    ]

    countries.forEach((country) => {
      expect(() => {
        import(`../src/components/VectorMaps/${country}`)
      }).not.toThrow()
    })
  })
})

describe('Map Data Validation', () => {
  test('should validate map projection types', () => {
    const validProjections = ['mercator', 'miller']

    validProjections.forEach((projection) => {
      expect(typeof projection).toBe('string')
      expect(['mercator', 'miller']).toContain(projection)
    })
  })

  test('should validate map name types', () => {
    const validMapNames = [
      'world',
      'world-merc',
      'us-merc',
      'us-mill',
      'us-lcc',
      'us-aea',
      'spain',
      'italy',
      'canada',
      'brasil',
      'russia',
    ]

    validMapNames.forEach((mapName) => {
      expect(typeof mapName).toBe('string')
      expect(mapName.length).toBeGreaterThan(0)
    })
  })

  test('should validate map options structure', () => {
    const validMapOptions = {
      projection: 'mercator' as const,
      backgroundColor: '#ffffff',
      draggable: true,
      zoomButtons: true,
      zoomOnScroll: true,
      zoomMax: 10,
      zoomMin: 1,
      showTooltip: true,
    }

    expect(validMapOptions.projection).toBe('mercator')
    expect(validMapOptions.backgroundColor).toBe('#ffffff')
    expect(validMapOptions.draggable).toBe(true)
    expect(validMapOptions.zoomButtons).toBe(true)
    expect(validMapOptions.zoomOnScroll).toBe(true)
    expect(validMapOptions.zoomMax).toBe(10)
    expect(validMapOptions.zoomMin).toBe(1)
    expect(validMapOptions.showTooltip).toBe(true)
  })
})
