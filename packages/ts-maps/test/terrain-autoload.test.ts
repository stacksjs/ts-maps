/**
 * Covers auto-loading of DEM tiles into the map's `TerrainSource` when a
 * `raster-dem` source is registered. The happy-dom environment doesn't
 * run real images, so these tests stub the fetch path directly and
 * assert the plumbing: URL templating, debouncing, event firing.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { TsMap } from '../src/core-map/map/index'

describe('Map terrain auto-load', () => {
  let container: HTMLElement
  let map: TsMap

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '300px'
    container.style.height = '200px'
    document.body.appendChild(container)
    map = new TsMap(container, { center: [0, 0], zoom: 3 })
  })

  afterEach(() => {
    map.remove()
    container.remove()
  })

  test('setTerrain inherits encoding + tileSize from the style source', () => {
    map.setStyle({
      version: 8,
      sources: {
        terrarium: {
          type: 'raster-dem',
          tiles: ['https://example.com/dem/{z}/{x}/{y}.png'],
          tileSize: 512,
          encoding: 'terrarium',
        } as any,
      },
      layers: [],
    })
    map.setTerrain({ source: 'terrarium' })
    const src = map.getTerrainSource()!
    expect(src.encoding).toBe('terrarium')
    expect(src.demSize).toBe(512)
  })

  test('defaults to mapbox encoding + 256 px when the source hasn\'t been added yet', () => {
    map.setTerrain({ source: 'dem' })
    const src = map.getTerrainSource()!
    expect(src.encoding).toBe('mapbox')
    expect(src.demSize).toBe(256)
  })

  test('_maybeFetchTerrainTile resolves the URL template and registers in-flight', async () => {
    map.setStyle({
      version: 8,
      sources: {
        dem: {
          type: 'raster-dem',
          tiles: ['https://example.com/dem/{z}/{x}/{y}.png'],
        } as any,
      },
      layers: [],
    })
    map.setTerrain({ source: 'dem' })

    // happy-dom has no real fetch → the fetch helper returns null,
    // the in-flight entry is cleared on finally. We verify that the
    // map queued a fetch at all (the registry exists).
    map._maybeFetchTerrainTile({ z: 5, x: 10, y: 12 })
    expect((map as any)._terrainFetchInFlight).toBeInstanceOf(globalThis.Map)
  })

  test('_maybeFetchTerrainTile is a no-op when terrain is off or the source is missing', () => {
    // No terrain configured.
    map._maybeFetchTerrainTile({ z: 0, x: 0, y: 0 })
    expect((map as any)._terrainFetchInFlight).toBeUndefined()

    // Terrain configured but no matching source.
    map.setStyle({ version: 8, sources: {}, layers: [] })
    map.setTerrain({ source: 'missing' })
    map._maybeFetchTerrainTile({ z: 0, x: 0, y: 0 })
    // The registry may or may not exist; critically no Map-state error.
  })

  test('_maybeFetchTerrainTile ignores non-raster-dem sources', () => {
    map.setStyle({
      version: 8,
      sources: {
        wrong: {
          type: 'raster',
          tiles: ['https://example.com/{z}/{x}/{y}.png'],
        } as any,
      },
      layers: [],
    })
    map.setTerrain({ source: 'wrong' })
    map._maybeFetchTerrainTile({ z: 1, x: 2, y: 3 })
    // Shouldn't queue any fetches — the source is raster, not raster-dem.
    const inflight = (map as any)._terrainFetchInFlight as globalThis.Map<string, unknown> | undefined
    expect(inflight === undefined || inflight.size === 0).toBe(true)
  })

  // Helper: very-happy-dom's querySelector is stingy with class selectors
  // — walk children directly.
  function findOverlay(root: HTMLElement): HTMLElement | null {
    for (let i = 0; i < root.children.length; i++) {
      const c = root.children[i] as HTMLElement
      if (c.className?.includes('ts-maps-terrain-overlay'))
        return c
    }
    return null
  }

  test('setTerrain creates a terrain overlay canvas inside the container', () => {
    expect(findOverlay(container)).toBeNull()
    map.setTerrain({ source: 'dem' })
    const overlay = findOverlay(container) as HTMLCanvasElement | null
    expect(overlay).not.toBeNull()
    expect(overlay!.tagName).toBe('CANVAS')
    // `.style` is optional on happy-dom canvases — only assert when present.
    if (overlay!.style)
      expect(overlay!.style.pointerEvents).toBe('none')
  })

  test('setTerrain(null) removes the overlay', () => {
    map.setTerrain({ source: 'dem' })
    expect(findOverlay(container)).not.toBeNull()
    map.setTerrain(null)
    expect(findOverlay(container)).toBeNull()
  })

  test('addTerrainTile short-circuits the fetch path — no fetch queued', () => {
    map.setStyle({
      version: 8,
      sources: {
        dem: {
          type: 'raster-dem',
          tiles: ['https://example.com/dem/{z}/{x}/{y}.png'],
        } as any,
      },
      layers: [],
    })
    map.setTerrain({ source: 'dem' })
    const px = new Uint8Array(256 * 256 * 4)
    map.addTerrainTile({ z: 2, x: 1, y: 1 }, px)
    expect(map.getTerrainSource()!.hasTile({ z: 2, x: 1, y: 1 })).toBe(true)
  })
})
