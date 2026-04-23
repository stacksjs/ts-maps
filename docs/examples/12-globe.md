# 12 · Globe projection preview

A Canvas2D orthographic preview of the `Projection.Globe` helpers. The full WebGL sphere renderer feeds the same `toSphere` / `globeToMercatorMix` functions into a vertex shader; here we render them in 2D so the demo is dependency-free.

Full source: [`12-globe.ts`](./12-globe.ts)

```ts
import { Projection } from 'ts-maps'

const v = Projection.Globe.toSphere({ lat: 40.7, lng: -74 })  // { x, y, z } on unit sphere
const mix = Projection.Globe.globeToMercatorMix(3)            // 1 = sphere, 0 = flat
```

---

[← Offline](./11-offline.md) · [Examples](./index.md)
