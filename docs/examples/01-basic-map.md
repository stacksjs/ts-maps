# 01 · Basic map

A vector basemap, a draggable marker and its popup: the least a map needs. The basemap is [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless, drawn with the built-in light style. `url` names its TileJSON, which the map reads for the tiles.

<iframe class="ts-maps-demo" src="/playground/examples/01-basic-map.html" title="Basic map, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/01-basic-map.html) · [Edit and run it](/playground/examples/edit.html?example=01-basic-map) · Full source: [`01-basic-map.ts`](./01-basic-map.ts)

```ts
import { DivIcon, Map, Marker, styles } from 'ts-maps'

const map = new Map('map', {
  center: [40.758, -73.9855],
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

new Marker([40.758, -73.9855], { icon: new DivIcon({ html: '<div class="pin"></div>' }), draggable: true })
  .addTo(map)
  .bindPopup('<b>Hello from ts-maps</b>')
  .openPopup()
```

---

[← Examples](./index.md) · [Camera →](./02-camera.md)
