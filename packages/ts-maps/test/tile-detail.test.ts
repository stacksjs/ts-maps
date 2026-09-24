import { describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { GridLayer } from '../src/core-map/layer/tile/GridLayer'
import { TileLayer } from '../src/core-map/layer/tile/TileLayer'
import { TsMap } from '../src/core-map/map/Map'

type Coords = Point & { z: number }

function makeMap(options: Record<string, unknown> = {}): TsMap {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new TsMap(el, { center: [37.7879, -122.4075], zoom: 15, ...options })
  // very-happy-dom has no layout; give the map a size of its own.
  map._size = new Point(1000, 640)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  map._applyCameraTransform()
  return map
}

function covering(map: TsMap, options: Record<string, unknown> = {}): Coords[] {
  const layer = new GridLayer({ tileSize: 256, ...options }) as any
  layer._map = map
  layer._tileZoom = Math.round(map.getZoom())
  layer._resetGrid()
  return layer._coveringTiles(map.getCenter())
}

/** The tile of `tiles` containing the ground under a container point, if any. */
function tilesUnder(map: TsMap, tiles: Coords[], point: Point): Coords[] {
  return tiles.filter((t) => {
    const px = map.project(map.containerPointToLatLng(point), t.z)
    return Math.floor(px.x / 256) === t.x && Math.floor(px.y / 256) === t.y
  })
}

describe('distance-based tile detail', () => {
  test('a tilted view uses coarser tiles in the distance and full detail near the camera', () => {
    const map = makeMap({ pitch: 60 })
    const tiles = covering(map)
    const zooms = new Set(tiles.map(t => t.z))
    expect(Math.max(...zooms)).toBe(15)
    expect(Math.min(...zooms)).toBeLessThan(15)

    const near = tilesUnder(map, tiles, new Point(500, 630))
    const far = tilesUnder(map, tiles, new Point(500, 5))
    expect(near[0]!.z).toBe(15)
    expect(far[0]!.z).toBeLessThan(15)
  })

  test('every point on screen is covered by exactly one tile', () => {
    const map = makeMap({ pitch: 55, bearing: 25 })
    const tiles = covering(map)
    for (let y = 0; y <= 640; y += 80) {
      for (let x = 0; x <= 1000; x += 100)
        expect(tilesUnder(map, tiles, new Point(x, y)).length).toBe(1)
    }
  })

  test('a tilted view needs fewer tiles than full detail to the horizon would', () => {
    const map = makeMap({ pitch: 60 })
    expect(covering(map).length).toBeLessThan(covering(map, { detailLevels: 0 }).length)
  })

  test('detailLevels: 0 keeps full detail everywhere', () => {
    const map = makeMap({ pitch: 60 })
    expect(covering(map, { detailLevels: 0 }).every(t => t.z === 15)).toBe(true)
  })

  test('detail never drops more than detailLevels below the view', () => {
    const map = makeMap({ pitch: 60, zoom: 16 })
    expect(covering(map, { detailLevels: 1 }).every(t => t.z >= 15)).toBe(true)
  })

  test('a rotated, untilted view is all full detail, and skips the corners it cannot see', () => {
    const map = makeMap({ bearing: 45 })
    const tiles = covering(map)
    expect(tiles.every(t => t.z === 15)).toBe(true)

    // The axis-aligned box around the turned view, which the flat path loads.
    const layer = new GridLayer({ tileSize: 256 }) as any
    layer._map = map
    layer._tileZoom = 15
    const range = layer._pxBoundsToTileRange(layer._getTiledPixelBounds(map.getCenter()))
    const box = (range.max.x - range.min.x + 1) * (range.max.y - range.min.y + 1)
    expect(tiles.length).toBeLessThan(box)
  })

  test('a raster tile asks the server for its own zoom, not the view\'s', () => {
    const map = makeMap({ pitch: 60 })
    const layer = new TileLayer('https://tiles/{z}/{x}/{y}.png') as any
    layer._map = map
    layer._tileZoom = 15
    layer._resetGrid()
    const coords = new Point(655, 1582) as Coords
    coords.z = 14
    expect(layer.getTileUrl(coords)).toBe('https://tiles/14/655/1582.png')
  })
})
