# 07 · Clusters

5,000 random points indexed by the zero-dep `GeoJSONClusterSource`. Pan and zoom to re-query — the index pre-builds one KD-tree per zoom level, so `getClusters` is O(log N).

Full source: [`07-clusters.ts`](./07-clusters.ts)

```ts
const source = new GeoJSONClusterSource({ radius: 50, maxZoom: 16 })
source.load(features)
const items = source.getClusters([west, south, east, north], zoom)
```

---

[← Hillshade](./06-hillshade.md) · [Symbols →](./08-symbols.md)
