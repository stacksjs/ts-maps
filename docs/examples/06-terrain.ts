/**
 * Example 06 — Terrain and hillshade.
 *
 * The Alps in 3D, from real elevation: AWS's open Terrain Tiles (Terrarium
 * encoding, no key). One `raster-dem` source feeds both the `hillshade` layer,
 * which shades the slopes, and `setTerrain`, which lifts the map onto them.
 */

import { styles, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [45.9763, 7.6586], // The Matterhorn
  zoom: 12,
  pitch: 60,
  bearing: -20,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

map.on('style.load', () => {
  map.addSource('dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'terrarium',
    attribution: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>',
  } as any)
  // Shading under the roads and labels, over the land.
  map.addStyleLayer({
    id: 'hillshade',
    type: 'hillshade',
    source: 'dem',
    paint: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#5a4a3a' },
  } as any, 'water')
  map.setTerrain({ source: 'dem', exaggeration: 1.3 })
})

const exaggeration = document.getElementById('exaggeration') as HTMLInputElement
const value = document.getElementById('exaggeration-value') as HTMLElement
exaggeration.addEventListener('input', () => {
  value.textContent = `${Number(exaggeration.value).toFixed(1)}×`
  map.setTerrain({ source: 'dem', exaggeration: Number(exaggeration.value) })
})

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
