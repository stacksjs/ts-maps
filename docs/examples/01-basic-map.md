# 01 · Basic map

An OpenStreetMap basemap with a draggable marker at Times Square and a bound popup. Pan, zoom, and drag work out of the box — no manual input wiring.

Full source: [`01-basic-map.ts`](./01-basic-map.ts)

```ts
import { DivIcon, Marker, tileLayer, TsMap } from 'ts-maps'

const map = new TsMap('map', { center: [40.758, -73.9855], zoom: 13 })

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

const icon = new DivIcon({ html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [13, 26] })
new Marker([40.758, -73.9855], { icon, draggable: true })
  .addTo(map)
  .bindPopup('<b>Hello from ts-maps</b>')
  .openPopup()
```

---

[← Examples](./index.md) · [Camera →](./02-camera.md)
