/**
 * The basemap the real-world demos share: Wildloop's planet, which is built
 * weekly with planetiler, stored as a PMTiles archive in R2 and served tile by
 * tile by `createTileWorker` from `ts-maps/worker` at tiles.wildloop.org
 * (see docs/concepts/tile-server.md). OpenFreeMap stands behind it, and
 * CARTO's raster tiles behind both, so a demo always has a map.
 */

import type { TsMap } from '../../packages/ts-maps/src/core-map'
import { offlineFetch, resolveTileJSON, styles } from '../../packages/ts-maps/src/core-map'

export const TILEJSON_SOURCES: string[] = [
  'https://tiles.wildloop.org/tiles.json',
  'https://tiles.openfreemap.org/planet',
]

const RASTER = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
}

// The network first, then a downloaded copy: a TileJSON stored with an
// offline map lets the page find its tiles with no connection.
function networkFirst(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return fetch(url, init).catch(() => offlineFetch(String(url), init))
}

/** Resolves the tiles and sets the light or dark basemap on `map`. */
export async function loadBasemap(map: TsMap, theme: 'light' | 'dark'): Promise<void> {
  const build = theme === 'dark' ? styles.dark : styles.light
  const found = await resolveTileJSON(TILEJSON_SOURCES, { fetch: networkFirst as typeof fetch })
  map.setStyle(found
    ? build({ tiles: found.tiles, maxzoom: found.maxzoom ?? 14, attribution: found.attribution ?? '© OpenMapTiles © OpenStreetMap contributors' })
    : build({ tiles: RASTER[theme], mode: 'raster', attribution: '© OpenStreetMap contributors © CARTO' }))
}
