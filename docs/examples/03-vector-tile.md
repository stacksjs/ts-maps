# 03 · Vector tiles, styled from scratch

The same OpenMapTiles planet the basemap draws, with a style of our own: a background and three layers picked by `source-layer`, painted with expressions. Click a road, a building or the river to see what its tile says about it, through `queryRenderedFeatures`.

<iframe class="ts-maps-demo" src="/playground/examples/03-vector-tile.html" title="Vector tiles, styled from scratch, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/03-vector-tile.html) · [Edit and run it](/playground/examples/edit.html?example=03-vector-tile) · Full source: [`03-vector-tile.ts`](./03-vector-tile.ts)

```ts
const map = new TsMap('map', {
  center: [51.5072, -0.1276],
  zoom: 15,
  style: {
    version: 8,
    sources: { planet: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': '#f4f1ea' } },
      { id: 'water', type: 'fill', source: 'planet', 'source-layer': 'water', paint: { 'fill-color': '#9cc3e6' } },
      { id: 'roads', type: 'line', source: 'planet', 'source-layer': 'transportation', paint: {
        'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#f2a33a', '#b9b2a6'],
      } },
      { id: 'buildings', type: 'fill', source: 'planet', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#d8d1c4' } },
    ],
  },
})

map.on('click', (e) => {
  const [hit] = map.queryRenderedFeatures(e.containerPoint, { layers: ['roads', 'buildings', 'water'] })
  if (hit)
    console.log(hit.layer.id, hit.feature.properties)
})
```

---

[← Camera](./02-camera.md) · [Style spec →](./04-style-spec.md)
