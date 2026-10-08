# 14 · Indoor maps

An airport terminal's floor plan, drawn one level at a time once you are close enough to see inside, with a level picker beside the map. Connected to search, its gates and shops are found by name: try "Gate A4" or "coffee", and choosing one goes to its level. The venue is IMDF, Apple's Indoor Mapping Data Format; [`data/terminal.ts`](./data/terminal.ts) builds a small one.

<iframe class="ts-maps-demo" src="/playground/examples/14-indoor.html" title="Indoor maps, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/14-indoor.html) · [Edit and run it](/playground/examples/edit.html?example=14-indoor) · Full source: [`14-indoor.ts`](./14-indoor.ts)

```ts
const search = control.search().addTo(map)
const indoor = indoorMap({ venue: '/imdf/terminal.zip' }).addTo(map)
indoor.connect(search)
```

---

[← Map types](./13-map-types.md) · [Landmarks and trees →](./15-landmarks.md)
