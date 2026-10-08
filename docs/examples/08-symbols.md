# 08 · Symbols with collision

Ten midtown POIs pushed through the library's `CollisionIndex`. High-priority labels are placed first; overlapping low-priority ones are dropped. Zoom out to watch labels fall off one by one.

<iframe class="ts-maps-demo" src="/playground/examples/08-symbols.html" title="08 · Symbols with collision, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/08-symbols.html) · Full source: [`08-symbols.ts`](./08-symbols.ts)

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
