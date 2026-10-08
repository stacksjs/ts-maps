# 07 · Clusters

5,000 points indexed by `GeoJSONClusterSource`, drawn as bubbles with their counts that regroup as you zoom. The index builds a tree per zoom level up front, so `getClusters` answers in O(log n).

<iframe class="ts-maps-demo" src="/playground/examples/07-clusters.html" title="Clusters, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/07-clusters.html) · [Edit and run it](/playground/examples/edit.html?example=07-clusters) · Full source: [`07-clusters.ts`](./07-clusters.ts)

```ts
// radius in on-screen pixels: the map's tiles are 256 px
const source = new GeoJSONClusterSource({ radius: 60, extent: 256, maxZoom: 16 })
source.load(features)
const items = source.getClusters([west, south, east, north], Math.floor(map.getZoom()))
```

---

[← Terrain and hillshade](./06-terrain.md) · [Symbols with collision →](./08-symbols.md)
