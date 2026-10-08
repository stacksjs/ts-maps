# 06 · Hillshade

Real DEM tile sources need an API key, so this example builds a synthetic height field in-browser and shades it with the same Horn algorithm used inside `RasterDEMLayer`. For a live basemap overlay, point the layer at your Terrain-RGB or Terrarium tiles.

<iframe class="ts-maps-demo" src="/playground/examples/06-hillshade.html" title="06 · Hillshade, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/06-hillshade.html) · Full source: [`06-hillshade.ts`](./06-hillshade.ts)

```ts
import { RasterDEMLayer } from 'ts-maps'

const dem = new RasterDEMLayer('https://tiles.example.com/terrain-rgb/{z}/{x}/{y}.png', {
  encoding: 'mapbox',
  exaggeration: 1.2,
  sun: { azimuth: 315, altitude: 45 },
})
dem.addTo(map)
```

---

[← Heatmap](./05-heatmap.md) · [Clusters →](./07-clusters.md)
