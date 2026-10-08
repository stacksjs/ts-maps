# 04 · Style spec

A raster OSM basemap with a GeoJSON polygon on top. Buttons swap the fill and stroke colours at runtime — no layer is re-added.

<iframe class="ts-maps-demo" src="/playground/examples/04-style-spec.html" title="04 · Style spec, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/04-style-spec.html) · Full source: [`04-style-spec.ts`](./04-style-spec.ts)

```ts
midtown.setStyle({ fillColor: '#f43f5e', color: '#f43f5e' })
// or, on a VectorTileMapLayer:
map.setPaintProperty('roads', 'line-color', '#0ea5e9')
```

---

[← Vector tiles](./03-vector-tile.md) · [Heatmap →](./05-heatmap.md)
