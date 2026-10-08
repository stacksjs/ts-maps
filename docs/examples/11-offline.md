# 11 · Offline maps

The Offline Maps button: pick an area, see how much it will take, and download it. Its tiles, fonts, places and roads are kept in the browser, so the map, search and directions all work with no connection. See [Offline](/concepts/offline).

<iframe class="ts-maps-demo" src="/playground/examples/11-offline.html" title="Offline maps, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/11-offline.html) · [Edit and run it](/playground/examples/edit.html?example=11-offline) · Full source: [`11-offline.ts`](./11-offline.ts)

```ts
control.offlineMaps({ resources: ['https://tiles.openfreemap.org/planet'] }).addTo(map)
```

---

[← Turn-by-turn](./10-turn-by-turn.md) · [Globe →](./12-globe.md)
