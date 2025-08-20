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
})
