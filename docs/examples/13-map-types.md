# 13 · Map types

Apple's map types from one basemap: Explore, Driving (roads first, and only the places a driver stops at), Transit (lines and stations) and Satellite (Esri's imagery with the names over it). Choosing one keeps the camera and anything the page added.

<iframe class="ts-maps-demo" src="/playground/examples/13-map-types.html" title="Map types, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/13-map-types.html) · [Edit and run it](/playground/examples/edit.html?example=13-map-types) · Full source: [`13-map-types.ts`](./13-map-types.ts)

```ts
control.mapType({ types: mapTypes({ url: 'https://tiles.openfreemap.org/planet' }) }).addTo(map)
```

---

[← Globe](./12-globe.md) · [Indoor maps →](./14-indoor.md)
