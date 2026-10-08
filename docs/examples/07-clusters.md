# 07 · Clusters

5,000 random points indexed by the zero-dep `GeoJSONClusterSource`. Pan and zoom to re-query — the index pre-builds one KD-tree per zoom level, so `getClusters` is O(log N).

<iframe class="ts-maps-demo" src="/playground/examples/07-clusters.html" title="07 · Clusters, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/07-clusters.html) · Full source: [`07-clusters.ts`](./07-clusters.ts)

```ts
// radius in on-screen pixels: the map's tiles are 256 px
const source = new GeoJSONClusterSource({ radius: 60, extent: 256, maxZoom: 16 })
source.load(features)
const items = source.getClusters([west, south, east, north], zoom)
```

---

[← Hillshade](./06-hillshade.md) · [Symbols →](./08-symbols.md)
