/**
 * Example 03 — Vector tiles, styled from scratch.
 *
 * The same OpenMapTiles planet the basemap draws, with a style of our own:
 * three layers, water, roads and buildings, picked by `source-layer` and
 * painted with expressions. Click a feature to see what the tile says about
 * it, through `queryRenderedFeatures`.
 */

import { TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [51.5072, -0.1276],
  zoom: 15,
  style: {
    version: 8,
    sources: {
      // A TileJSON: the map reads it for the tiles and their zoom range.
      planet: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': '#f4f1ea' } },
      { id: 'water', type: 'fill', source: 'planet', 'source-layer': 'water', paint: { 'fill-color': '#9cc3e6' } },
      {
        id: 'roads',
        type: 'line',
        source: 'planet',
        'source-layer': 'transportation',
        paint: {
          // Major roads in amber and wider; the rest in grey.
          'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#f2a33a', '#b9b2a6'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 12, 5]],
        },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'planet',
        'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': '#d8d1c4', 'fill-outline-color': '#c3b9a8' },
      },
    ],
  } as any,
})

const info = document.getElementById('info') as HTMLDivElement
info.textContent = 'Click a road, a building or the river.'

map.on('click', (e: any) => {
  const hits = map.queryRenderedFeatures(e.containerPoint, { layers: ['roads', 'buildings', 'water'] })
  const top = hits[0] as any
  if (!top) {
    info.textContent = 'Nothing here. Try a road, a building or the river.'
    return
  }
  // A hit is the feature, its style layer and the tile it came from.
  const props = Object.entries(top.feature?.properties ?? {}).filter(([, v]) => v !== undefined && v !== null)
  info.innerHTML = `<b>${top.layer?.id ?? top.sourceLayer}</b><br>${props.map(([k, v]) => `${k}: ${String(v)}`).join('<br>')}`
})

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
