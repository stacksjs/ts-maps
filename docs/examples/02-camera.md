# 02 · Camera

Three ways to move the camera. `flyTo` arcs out and back in for a long hop, `easeTo` glides any of centre, zoom, bearing and pitch, and `jumpTo` sets them at once.

<iframe class="ts-maps-demo" src="/playground/examples/02-camera.html" title="Camera, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/02-camera.html) · [Edit and run it](/playground/examples/edit.html?example=02-camera) · Full source: [`02-camera.ts`](./02-camera.ts)

```ts
map.flyTo([51.5074, -0.1278], 13)
map.easeTo({ bearing: 30, pitch: 50, duration: 900 })
map.jumpTo({ center: [48.8566, 2.3522], zoom: 14, bearing: 20, pitch: 40 })
```

---

[← Basic map](./01-basic-map.md) · [Vector tiles, styled from scratch →](./03-vector-tile.md)
