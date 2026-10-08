# 06 · Terrain and hillshade

The Matterhorn, shaded from real elevation: AWS's open [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium encoding, no key). One `raster-dem` source feeds both the `hillshade` layer, which shades the slopes, and `setTerrain`, which lets the map say how high the ground is: click anywhere. The slider sets how strongly the slopes are shaded.

<iframe class="ts-maps-demo" src="/playground/examples/06-terrain.html" title="Terrain and hillshade, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/06-terrain.html) · [Edit and run it](/playground/examples/edit.html?example=06-terrain) · Full source: [`06-terrain.ts`](./06-terrain.ts)

```ts
map.on('style.load', () => {
  map.addSource('dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    encoding: 'terrarium',
  })
  map.addStyleLayer({ id: 'hillshade', type: 'hillshade', source: 'dem' }, 'water')
  map.setTerrain({ source: 'dem' })
})

map.on('click', (e) => {
  const metres = map.queryTerrainElevation(e.latlng) // null until that tile has loaded
})
```

---

[← Heatmap](./05-heatmap.md) · [Clusters →](./07-clusters.md)
