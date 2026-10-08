# 10 · Turn-by-turn

Directions from the Ferry Building to the Palace of Fine Arts: the routes to choose from, then Go for the banner, the lanes, the voice and a camera that follows. `simulate` drives the route so it can be watched from a desk; without it, the device's position does.

<iframe class="ts-maps-demo" src="/playground/examples/10-turn-by-turn.html" title="Turn-by-turn, running" loading="lazy" style="width: 100%; height: 520px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/10-turn-by-turn.html) · [Edit and run it](/playground/examples/edit.html?example=10-turn-by-turn) · Full source: [`10-turn-by-turn.ts`](./10-turn-by-turn.ts)

```ts
const nav = turnByTurn(map, { destinationName: 'Palace of Fine Arts', simulate: { speed: 14 } })
await nav.preview({ lat: 37.7955, lng: -122.3937 }, { lat: 37.8029, lng: -122.4484 })
nav.start()
```

---

[← Search](./09-search.md) · [Offline maps →](./11-offline.md)
