/**
 * Example 06 — Terrain and hillshade.
 *
 * The Matterhorn, shaded from real elevation: AWS's open Terrain Tiles
 * (Terrarium encoding, no key). One `raster-dem` source feeds the `hillshade`
 * layer, which shades the slopes, and `setTerrain`, which lets the map answer
 * how high the ground is anywhere you click.
 */

import { styles, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [45.9763, 7.6586], // The Matterhorn
  zoom: 12,
  pitch: 45,
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
  // The heights, for queryTerrainElevation.
  map.setTerrain({ source: 'dem' })
})

const shading = document.getElementById('shading') as HTMLInputElement
const shadingValue = document.getElementById('shading-value') as HTMLElement
shading.addEventListener('input', () => {
  shadingValue.textContent = Number(shading.value).toFixed(2)
  map.setPaintProperty('hillshade', 'hillshade-exaggeration', Number(shading.value))
})

const height = document.getElementById('height') as HTMLElement
map.on('click', (e: any) => {
  const metres = map.queryTerrainElevation(e.latlng)
  height.textContent = metres === null ? 'No height here yet.' : `${Math.round(metres).toLocaleString()} m above sea level`
})

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
