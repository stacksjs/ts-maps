# 02 · Camera

Three animation modes on one camera. `flyTo` arcs out and in for long hops; `easeTo` linearly tweens any combination of center, zoom, bearing and pitch; `jumpTo` sets every knob instantly.

Full source: [`02-camera.ts`](./02-camera.ts)

```ts
map.flyTo(new LatLng(51.5074, -0.1278), 11, { duration: 1600 })
map.easeTo({ bearing: 30, pitch: 45, duration: 900 })
map.jumpTo({ center: [48.8566, 2.3522], zoom: 12, bearing: 20, pitch: 30 })
```

---

[← Basic map](./01-basic-map.md) · [Vector tiles →](./03-vector-tile.md)
