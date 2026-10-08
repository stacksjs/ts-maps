# 02 · Camera

Three animation modes on one camera. `flyTo` arcs out and in for long hops; `easeTo` linearly tweens any combination of center, zoom, bearing and pitch; `jumpTo` sets every knob instantly.

<iframe class="ts-maps-demo" src="/playground/examples/02-camera.html" title="02 · Camera, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/02-camera.html) · Full source: [`02-camera.ts`](./02-camera.ts)

```ts
map.flyTo(new LatLng(51.5074, -0.1278), 11, { duration: 1600 })
map.easeTo({ bearing: 30, pitch: 45, duration: 900 })
map.jumpTo({ center: [48.8566, 2.3522], zoom: 12, bearing: 20, pitch: 30 })
```

---

[← Basic map](./01-basic-map.md) · [Vector tiles →](./03-vector-tile.md)
