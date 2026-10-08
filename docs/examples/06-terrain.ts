/**
 * Example 06 — Terrain and hillshade.
 *
 * The Matterhorn in 3D, from real elevation: AWS's open Terrain Tiles
 * (Terrarium encoding, no key). One `raster-dem` source feeds `setTerrain`,
 * which raises the ground — the mountain stands up, the valleys sink — and a
 * `hillshade` layer, which shades the slopes. Labels and the popup stand on
 * the surface. Click anywhere for the height of the ground there.
 */

import { styles, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  // Above the Zmutt valley, looking south-west at the Matterhorn.
  center: [45.992, 7.69],
  zoom: 13.2,
  pitch: 68,
  bearing: 235,
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
  // The same heights raise the ground.
  map.setTerrain({ source: 'dem', exaggeration: 1 })
  map.openPopup('Matterhorn, 4,478 m', [45.97636, 7.65861])
})

const exaggeration = document.getElementById('exaggeration') as HTMLInputElement
const exaggerationValue = document.getElementById('exaggeration-value') as HTMLElement
exaggeration.addEventListener('input', () => {
  exaggerationValue.textContent = Number(exaggeration.value).toFixed(1)
  map.setTerrain({ source: 'dem', exaggeration: Number(exaggeration.value) })
})

const shading = document.getElementById('shading') as HTMLInputElement
const shadingValue = document.getElementById('shading-value') as HTMLElement
shading.addEventListener('input', () => {
  shadingValue.textContent = Number(shading.value).toFixed(2)
  map.setPaintProperty('hillshade', 'hillshade-exaggeration', Number(shading.value))
})

// The click lands on the slope under the pointer, not on the flat map
// behind it, so the height is the height of what you clicked.
const height = document.getElementById('height') as HTMLElement
map.on('click', (e: any) => {
  const metres = map.queryTerrainElevation(e.latlng)
  height.textContent = metres === null ? 'No height here yet.' : `${Math.round(metres).toLocaleString()} m above sea level`
})

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
