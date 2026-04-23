# 08 · Symbols with collision

Ten midtown POIs pushed through the library's `CollisionIndex`. High-priority labels are placed first; overlapping low-priority ones are dropped. Zoom out to watch labels fall off one by one.

Full source: [`08-symbols.ts`](./08-symbols.ts)

```ts
import { CollisionIndex } from 'ts-maps/symbols'

const index = new CollisionIndex({ width, height, cellSize: 64 })
for (const poi of sortedByPriority) {
  if (index.tryInsert({ minX, minY, maxX, maxY, priority: poi.priority }))
    new Marker([poi.lat, poi.lng], { icon }).addTo(map)
}
```

---

[← Clusters](./07-clusters.md) · [Geocoder →](./09-geocoder.md)
