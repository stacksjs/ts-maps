# 11 · Offline tiles

Pan the map to an area, click _Download_, then _Disable network_: tiles inside the downloaded bbox keep rendering from `TileCache` while the network is blocked.

Full source: [`11-offline.ts`](./11-offline.ts)

```ts
const cache = new TileCache({ name: 'ts-maps-docs-offline' })

const result = await saveOfflineRegion({
  bounds: [west, south, east, north],
  zoomRange: [10, 12],
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  cache,
  concurrency: 4,
})
```

---

[← Directions](./10-directions.md) · [Globe →](./12-globe.md)
