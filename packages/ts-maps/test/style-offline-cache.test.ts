import { describe, expect, test } from 'bun:test'
import { TsMap } from '../src/core-map/map/Map'
import { TileLayer, VectorTileMapLayer } from '../src/core-map'
import { validateStyle } from '../src/core-map/style-spec'
import type { Style } from '../src/core-map/style-spec'

/**
 * `saveOfflineRegion` fills a shared `TileCache`, and the tile layers will read
 * from it — but only when handed `offlineCache`, and a source built from a
 * style spec never was. An app that pre-downloaded a region for offline use was
 * downloading tiles its own basemap would never ask for: the download reported
 * success, and the map was blank in the field.
 */
function makeMap(style: Style): TsMap {
  const container = document.createElement('div')
  container.style.width = '400px'
  container.style.height = '400px'
  document.body.appendChild(container)
  return new TsMap(container, { zoomAnimation: false, fadeAnimation: false, style })
}

function sourceLayer(map: TsMap, Ctor: any): any {
  let found: any
  map.eachLayer((layer: any) => {
    if (layer instanceof Ctor)
      found = layer
  })
  return found
}

const VECTOR = {
  type: 'vector' as const,
  tiles: ['https://example.com/vt/{z}/{x}/{y}.pbf'],
  maxzoom: 14,
}

const RASTER = {
  type: 'raster' as const,
  tiles: ['https://example.com/r/{z}/{x}/{y}.png'],
  tileSize: 256,
}

describe('offlineCache on a style source', () => {
  test('validates as part of a vector source', () => {
    const errors = validateStyle({
      version: 8,
      sources: { basemap: { ...VECTOR, offlineCache: true } },
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#fff' } }],
    } as any)
    expect(errors).toEqual([])
  })

  test('reaches the vector tile layer', () => {
    const map = makeMap({
      version: 8,
      sources: { basemap: { ...VECTOR, offlineCache: true } },
      layers: [{
        id: 'water',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'water',
        paint: { 'fill-color': '#0ea5e9' },
      }],
    } as any)

    expect(sourceLayer(map, VectorTileMapLayer).options.offlineCache).toBe(true)
  })

  test('reaches the raster tile layer', () => {
    const map = makeMap({
      version: 8,
      sources: { basemap: { ...RASTER, offlineCache: true } },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    } as any)

    expect(sourceLayer(map, TileLayer).options.offlineCache).toBe(true)
  })

  test('is off unless the style asks for it', () => {
    // Reading a style's tiles back through IndexedDB is a decision an app
    // makes, not a default worth taking on its behalf.
    const map = makeMap({
      version: 8,
      sources: { basemap: RASTER },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    } as any)

    expect(sourceLayer(map, TileLayer).options.offlineCache).toBeFalsy()
  })
})
