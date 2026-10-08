# 03 · Vector tiles

A single synthetic MVT tile fabricated client-side via the in-house `Pbf` writer, rendered through three style layers: a water fill, two roads, and three POIs. Click to hit-test with `queryRenderedFeatures`.

<iframe class="ts-maps-demo" src="/playground/examples/03-vector-tile.html" title="03 · Vector tiles, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/03-vector-tile.html) · Full source: [`03-vector-tile.ts`](./03-vector-tile.ts)

```ts
vectorTileLayer({
  url: 'demo-tiles/{z}/{x}/{y}.pbf',
  tileSize: 512,
  layers: [
    { id: 'water',  type: 'fill',   sourceLayer: 'water', paint: { 'fill-color': '#0ea5e9' } },
    { id: 'roads',  type: 'line',   sourceLayer: 'roads', paint: { 'line-color': '#6b7280', 'line-width': 2 } },
    { id: 'places', type: 'circle', sourceLayer: 'place', paint: { 'circle-radius': 5 } },
  ],
}).addTo(map)
```

---

[← Camera](./02-camera.md) · [Style spec →](./04-style-spec.md)
