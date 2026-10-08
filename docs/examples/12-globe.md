# 12 · Globe

The whole world on a sphere, drawn from the same basemap tiles as the flat map. Drag to turn it: the place you grab stays under the pointer. Zoom in past 5.5 and it fades into the flat map, lined up with it. Labels stand upright on it and markers ride it.

<iframe class="ts-maps-demo" src="/playground/examples/12-globe.html" title="Globe, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/12-globe.html) · [Edit and run it](/playground/examples/edit.html?example=12-globe) · Full source: [`12-globe.ts`](./12-globe.ts)

```ts
const map = new TsMap('map', {
  center: [30, 10],
  zoom: 2.5,
  projection: 'globe',
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

// The halo round it, and the space behind.
map.setFog({ 'color': '#ffffff', 'space-color': '#dfe7f0' })
```

---

[← Offline maps](./11-offline.md) · [Map types →](./13-map-types.md)
