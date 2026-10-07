/**
 * Satellite and hybrid maps: aerial imagery, alone or with the basemap's
 * roads and names drawn over it, as Apple's Satellite map with labels on.
 *
 * Imagery comes from a raster tile service, which ts-maps does not ship.
 * Esri World Imagery is the default because it needs no key; check its terms
 * for your use, or pass another (MapTiler Satellite, Mapbox Satellite, your
 * own) as `imagery` with its `attribution`.
 */

import type { Style as StyleSpec } from '../style-spec/types'
import type { BasemapStyleOptions } from './basemap'
import { dark } from './basemap'

export const ESRI_WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const ESRI_WORLD_IMAGERY_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'

export interface ImageryOptions {
  /** Imagery tile URL template(s). Default Esri World Imagery. */
  imagery?: string | string[]
  /** The imagery's credit. Required by every imagery service. */
  imageryAttribution?: string
  /** Default 19. */
  imageryMaxzoom?: number
  /** Default 256. */
  imageryTileSize?: number
  /** Read imagery through the shared offline cache. */
  offlineCache?: boolean
}

const IMAGERY = 'imagery'

function imagerySource(options: ImageryOptions): StyleSpec['sources'][string] {
  const tiles = options.imagery ?? ESRI_WORLD_IMAGERY
  return {
    type: 'raster',
    tiles: Array.isArray(tiles) ? tiles : [tiles],
    tileSize: options.imageryTileSize ?? 256,
    maxzoom: options.imageryMaxzoom ?? 19,
    attribution: options.imageryAttribution ?? (options.imagery ? undefined : ESRI_WORLD_IMAGERY_ATTRIBUTION),
    ...(options.offlineCache ? { offlineCache: true } : {}),
  } as StyleSpec['sources'][string]
}

/** Imagery alone, with no roads or names. */
export function satellite(options: ImageryOptions & { name?: string } = {}): StyleSpec {
  return {
    version: 8,
    name: options.name ?? 'ts-maps satellite',
    sources: { [IMAGERY]: imagerySource(options) },
    layers: [
      // Behind the imagery, so a tile still loading is dark rather than white.
      { id: 'background', type: 'background', paint: { 'background-color': '#1b1d1a' } },
      { id: IMAGERY, type: 'raster', source: IMAGERY, paint: { 'raster-opacity': 1 } },
    ] as StyleSpec['layers'],
  }
}

/** The basemap layers worth keeping over imagery: roads, borders and names. */
const OVER_IMAGERY = new Set(['road-minor', 'road-major', 'boundary', 'road-label', 'poi', 'water-label', 'place-minor', 'place-label'])

/**
 * Imagery with the basemap's roads and names over it. Roads are thin and
 * translucent so the ground shows through; names are white on a dark halo,
 * which reads on fields, roofs and water alike.
 */
export function hybrid(options: BasemapStyleOptions & ImageryOptions): StyleSpec {
  const base = dark({ ...options, name: options.name ?? 'ts-maps hybrid' })
  const layers = (base.layers as any[])
    .filter(layer => OVER_IMAGERY.has(layer.id))
    .map((layer) => {
      const paint = { ...layer.paint }
      if (layer.id === 'road-major')
        paint['line-color'] = 'rgba(255, 214, 120, 0.85)'
      else if (layer.id === 'road-minor')
        paint['line-color'] = 'rgba(255, 255, 255, 0.45)'
      else if (layer.id === 'boundary')
        paint['line-color'] = 'rgba(255, 255, 255, 0.6)'
      else if (layer.type === 'symbol') {
        if (layer.id !== 'poi')
          paint['text-color'] = layer.id === 'road-label' ? '#f2f2f2' : '#ffffff'
        paint['text-halo-color'] = 'rgba(0, 0, 0, 0.75)'
      }
      return { ...layer, paint }
    })
  return {
    ...base,
    sources: { [IMAGERY]: imagerySource(options), ...base.sources },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1b1d1a' } },
      { id: IMAGERY, type: 'raster', source: IMAGERY, paint: { 'raster-opacity': 1 } },
      ...layers,
    ] as StyleSpec['layers'],
  }
}
