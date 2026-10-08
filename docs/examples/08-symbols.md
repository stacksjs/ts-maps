# 08 · Symbols with collision

Ten midtown landmarks laid out by the library's `CollisionIndex`: the most important first, and any that would overlap one already placed left out. Zoom out to watch them drop away.

<iframe class="ts-maps-demo" src="/playground/examples/08-symbols.html" title="Symbols with collision, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/08-symbols.html) · [Edit and run it](/playground/examples/edit.html?example=08-symbols) · Full source: [`08-symbols.ts`](./08-symbols.ts)

```ts
import { CollisionIndex } from 'ts-maps/symbols'

const index = new CollisionIndex({ width, height, cellSize: 64 })
for (const poi of byPriority) {
  if (index.tryInsert({ minX, minY, maxX, maxY, priority: poi.priority }))
    new Marker([poi.lat, poi.lng], { icon }).addTo(map)
}
```

---

[← Clusters](./07-clusters.md) · [Search →](./09-search.md)
