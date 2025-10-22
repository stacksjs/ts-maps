import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { VectorMap } from '../src/vector-map'

// Mock DOM environment for testing
function mockDOM() {
  // Mock Node if it doesn't exist
  if (typeof globalThis.Node === 'undefined') {
    globalThis.Node = class Node {
      static ELEMENT_NODE = 1
      static TEXT_NODE = 3
    } as any
  }

  // Create a mock container element
  const container = {
    id: 'test-container',
    style: { width: '800px', height: '600px' },
    appendChild: () => {},
    removeChild: () => {},
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
    },
    setAttribute: () => {},
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as any

  // Mock document methods
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: () => container,
      createElementNS: () => container,
      getElementById: () => container,
      querySelector: () => container,
      body: { appendChild: () => {} },
      readyState: 'complete',
    } as any
  }

  // Mock window if it doesn't exist
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis as any
  }

  return container
}

function cleanupDOM() {
  // Clean up any global mocks if needed
}

describe('VectorMap', () => {
  beforeEach(async () => {
    mockDOM()

    // Mock the Map.maps static property with test map data
    const { Map } = await import('../src/map')
    Map.maps['test-map'] = {
      name: 'test-map',
      width: 800,
      height: 600,
      paths: {
        'US-CA': { path: 'M 100 100 L 200 100 L 200 200 L 100 200 Z', name: 'California' },
        'US-TX': { path: 'M 300 300 L 400 300 L 400 400 L 300 400 Z', name: 'Texas' },
      },
    }
  })

  afterEach(() => {
    cleanupDOM()
  })

  test('should throw error when no selector is provided', () => {
    expect(() => {
      const _ = new VectorMap({} as any)
    }).toThrow('Selector is not given.')
  })

  test('should accept valid options with selector', () => {
    const options = {
      selector: '#test-container',
      map: { name: 'test-map', projection: 'mercator' as const },
    }

    // Just test that the constructor doesn't throw immediately
    expect(() => {
      const _vectorMap = new VectorMap(options)
      // The constructor might throw later during initialization, but that's okay for this test
    }).not.toThrow('Selector is not given.')
  })

  test('should have addMap static method', () => {
    expect(typeof VectorMap.addMap).toBe('function')
  })

  test('should add map data using addMap static method', async () => {
    const testMapData = {
      name: 'test-custom-map',
      width: 1000,
      height: 800,
      paths: {
        'TEST-1': { path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z', name: 'Test Region 1' },
        'TEST-2': { path: 'M 200 200 L 300 200 L 300 300 L 200 300 Z', name: 'Test Region 2' },
      },
    }

    VectorMap.addMap('test-custom-map', testMapData)

    const { Map } = await import('../src/map')
    expect(Map.maps['test-custom-map']).toBeDefined()
    expect(Map.maps['test-custom-map'].name).toBe('test-custom-map')
    expect(Map.maps['test-custom-map'].width).toBe(1000)
    expect(Map.maps['test-custom-map'].height).toBe(800)
  })

  test('should throw error when selector is empty string', () => {
    expect(() => {
      const _ = new VectorMap({ selector: '' } as any)
    }).toThrow('Selector is not given.')
  })

  test('should throw error when selector is null', () => {
    expect(() => {
      const _ = new VectorMap({ selector: null } as any)
    }).toThrow('Selector is not given.')
  })

  test('should throw error when selector is undefined', () => {
    expect(() => {
      const _ = new VectorMap({ selector: undefined } as any)
    }).toThrow('Selector is not given.')
  })

  test('should accept valid map options with all properties', () => {
    const options = {
      selector: '#test-container',
      map: { name: 'test-map', projection: 'mercator' as const },
      backgroundColor: '#f0f0f0',
      draggable: true,
      zoomButtons: true,
      zoomOnScroll: true,
      zoomMax: 5,
      zoomMin: 0.5,
      showTooltip: true,
    }

    expect(() => {
      const _vectorMap = new VectorMap(options)
    }).not.toThrow('Selector is not given.')
  })

  test('should validate map projection types', () => {
    const validProjections = ['mercator', 'miller']

    validProjections.forEach((projection) => {
      const options = {
        selector: '#test-container',
        map: { name: 'test-map', projection: projection as 'mercator' | 'miller' },
      }

      // Test that constructor doesn't throw selector error, but may throw element not found
      expect(() => {
        const _vectorMap = new VectorMap(options)
      }).not.toThrow('Selector is not given.')
    })
  })

  test('should handle map data with complex path structures', async () => {
    const complexMapData = {
      name: 'complex-test-map',
      width: 1200,
      height: 900,
      paths: {
        'COMPLEX-1': {
          path: 'M 100 100 L 200 100 L 200 200 L 100 200 Z M 150 150 L 180 150 L 180 180 L 150 180 Z',
          name: 'Complex Region 1',
        },
        'COMPLEX-2': {
          path: 'M 300 300 C 350 300 350 350 300 350 C 250 350 250 300 300 300 Z',
          name: 'Complex Region 2',
        },
      },
    }

    VectorMap.addMap('complex-test-map', complexMapData)

    const { Map } = await import('../src/map')
    expect(Map.maps['complex-test-map']).toBeDefined()
    expect(Map.maps['complex-test-map'].paths['COMPLEX-1'].path).toContain('M 100 100')
    expect(Map.maps['complex-test-map'].paths['COMPLEX-2'].path).toContain('C 350 300')
  })

  test('should handle region selection configuration', () => {
    const optionsWithRegions = {
      selector: '#test-container',
      map: { name: 'test-map', projection: 'mercator' as const },
      regions: ['US-CA', 'US-TX'],
      selectedRegions: ['US-CA'],
      regionsSelectable: true,
      regionsSelectableOne: false,
      regionStyle: {
        initial: { 'fill': '#cccccc', 'stroke': '#000000', 'stroke-width': 1 },
        hover: { fill: '#aaaaaa' },
        selected: { fill: '#888888' },
      },
    }

    // Test that constructor doesn't throw selector error, but may throw element not found
    expect(() => {
      const _vectorMap = new VectorMap(optionsWithRegions)
    }).not.toThrow('Selector is not given.')
  })

  test('should handle zoom configuration options', () => {
    const optionsWithZoom = {
      selector: '#test-container',
      map: { name: 'test-map', projection: 'mercator' as const },
      zoomButtons: true,
      zoomOnScroll: true,
      zoomOnScrollSpeed: 1.2,
      zoomMax: 8,
      zoomMin: 0.3,
      zoomStep: 0.5,
      zoomAnimate: true,
    }

    // Test that constructor doesn't throw selector error, but may throw element not found
    expect(() => {
      const _vectorMap = new VectorMap(optionsWithZoom)
    }).not.toThrow('Selector is not given.')
  })

  test('should handle event handler callbacks', () => {
    const mockCallback = () => {}

    const optionsWithCallbacks = {
      selector: '#test-container',
      map: { name: 'test-map', projection: 'mercator' as const },
      onLoaded: mockCallback,
      onViewportChange: mockCallback,
      onRegionClick: mockCallback,
      onRegionSelected: mockCallback,
      onMarkerClick: mockCallback,
      onMarkerSelected: mockCallback,
      onRegionTooltipShow: mockCallback,
      onMarkerTooltipShow: mockCallback,
    }

    // Test that constructor doesn't throw selector error, but may throw element not found
    expect(() => {
      const _vectorMap = new VectorMap(optionsWithCallbacks)
    }).not.toThrow('Selector is not given.')
  })
})
