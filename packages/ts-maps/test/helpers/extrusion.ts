import type { BuildingDraw } from '../../src/core-map/renderer/webgl/BuildingOverlay'
import type { VectorTileStyleLayer } from '../../src/core-map/layer/tile/VectorTileMapLayer'
import { GeoJSONTileSource, VectorTileMapLayer } from '../../src/core-map'
import { Point } from '../../src/core-map/geometry/Point'
import { Map } from '../../src/core-map/map/Map'

/**
 * A geojson source drawn as `fill-extrusion`, without a GPU or a tile grid.
 *
 * The test DOM has no WebGL and its canvas no `classList`, so neither the
 * building overlay nor GridLayer's own tile bookkeeping can run. The layer is
 * wired by hand instead — its map, its tile table and a stand-in overlay that
 * records what it is asked to draw — which leaves the whole of the pipeline
 * under test: slicing, filtering, paint evaluation, meshing, occluders and
 * the per-frame draw list.
 */

export interface ExtrusionHarness {
  map: Map
  layer: VectorTileMapLayer
  source: GeoJSONTileSource
  /** Every frame the stand-in overlay was asked to draw, oldest first. */
  frames: Array<{ draws: BuildingDraw[], options: { light: [number, number], fog: [number, number] } }>
  /** Vertex ranges patched in place, as `[key, first, count]`. */
  patches: Array<[object, number, number]>
  /** Feature state by id, as `Map.setFeatureState` would hold it. */
  state: Record<string, Record<string, unknown>>
  /** Decode grid tile x/y/z, as GridLayer would on showing it. */
  show: (x: number, y: number, z: number) => Promise<void>
  /** Run a frame of the building pass and return its draws. */
  draw: () => BuildingDraw[]
}

export const SOURCE = 'cells'

export function square(id: string | number, lng: number, lat: number, size: number, properties: Record<string, unknown> = {}): any {
  // Counter-clockwise, as RFC 7946 winds an outer ring.
  return {
    type: 'Feature',
    id,
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]],
    },
  }
}

export function collection(...features: any[]): any {
  return { type: 'FeatureCollection', features }
}

export function extrusionHarness(
  data: unknown,
  paint: Record<string, unknown>,
  options: { center?: [number, number], zoom?: number, size?: number, pitch?: number, bearing?: number, layer?: Partial<VectorTileStyleLayer>, buffer?: number } = {},
): ExtrusionHarness {
  const size = options.size ?? 512
  const container = document.createElement('div')
  container.style.width = `${size}px`
  container.style.height = `${size}px`
  document.body.appendChild(container)

  const map = new Map(container, { center: options.center ?? [0, 0], zoom: options.zoom ?? 4, zoomAnimation: false })
  map._pitch = options.pitch ?? 0
  map._bearing = options.bearing ?? 0
  map._size = new Point(size, size)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)

  const source = new GeoJSONTileSource(data, { layerName: SOURCE, buffer: options.buffer })
  const layer = new VectorTileMapLayer({
    localSource: source,
    tileSize: 512,
    layers: [{ id: 'prisms', type: 'fill-extrusion', sourceLayer: SOURCE, paint, ...options.layer } as VectorTileStyleLayer],
  })
  layer._map = map
  layer._tiles = {}
  layer.setSourceId(SOURCE)

  const state: Record<string, Record<string, unknown>> = {}
  layer.setFeatureStateLookup((_source, _layer, id) => state[String(id)] ?? {})

  const frames: ExtrusionHarness['frames'] = []
  const patches: ExtrusionHarness['patches'] = []
  layer._buildingOverlay = {
    active: true,
    resize() {},
    clear() {},
    release() {},
    remove() {},
    patch: (key: object, _mesh: unknown, first: number, count: number) => patches.push([key, first, count]),
    render: (draws: BuildingDraw[], opts: { light: [number, number], fog: [number, number] }) => frames.push({ draws, options: opts }),
  } as any

  const show = async (x: number, y: number, z: number): Promise<void> => {
    const coords = new Point(x, y) as Point & { z: number }
    coords.z = z
    await new Promise<void>((resolve) => {
      const canvas = layer.createTile(coords, () => resolve())
      layer._tiles![`${x}:${y}:${z}`] = { el: canvas, coords, current: true } as any
    })
  }

  const draw = (): BuildingDraw[] => {
    layer._drawBuildings()
    return frames.at(-1)?.draws ?? []
  }

  return { map, layer, source, frames, patches, state, show, draw }
}
