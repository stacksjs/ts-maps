# 06 · Terrain and hillshade

The Matterhorn in 3D, from real elevation: AWS's open [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium encoding, no key). One `raster-dem` source feeds both `setTerrain`, which raises the ground — the mountain stands up, the valleys sink — and the `hillshade` layer, which shades the slopes. Labels and the popup stand on the surface, and labels behind a ridge are hidden. One slider sets the exaggeration, the other how strongly the slopes are shaded. Click anywhere for the height of the ground there: the click lands on the slope under the pointer.

<iframe class="ts-maps-demo" src="/playground/examples/06-terrain.html" title="Terrain and hillshade, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/06-terrain.html) · [Edit and run it](/playground/examples/edit.html?example=06-terrain) · Full source: [`06-terrain.ts`](./06-terrain.ts)

```ts
const map = new TsMap('map', {
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
  })
  map.addStyleLayer({ id: 'hillshade', type: 'hillshade', source: 'dem' }, 'water')
  map.setTerrain({ source: 'dem', exaggeration: 1 })
})

// The slider: the same call, with a new exaggeration.
slider.addEventListener('input', () => {
  map.setTerrain({ source: 'dem', exaggeration: Number(slider.value) })
})

map.on('click', (e) => {
  const metres = map.queryTerrainElevation(e.latlng) // null until that tile has loaded
})
```

---

[← Heatmap](./05-heatmap.md) · [Clusters →](./07-clusters.md)
