# 05 · Heatmap

A `HeatmapLayer` over 500 points, its colour ramp cycling every few seconds. Without a `max`, the densest spot in view is the top of the ramp and everything else is shaded against it.

<iframe class="ts-maps-demo" src="/playground/examples/05-heatmap.html" title="Heatmap, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/05-heatmap.html) · [Edit and run it](/playground/examples/edit.html?example=05-heatmap) · Full source: [`05-heatmap.ts`](./05-heatmap.ts)

```ts
const heat = new HeatmapLayer({
  data: points, // [{ lat, lng, weight }]
  radius: 25,
  blur: 20,
  gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' },
})
heat.addTo(map)
```

---

[← Style spec](./04-style-spec.md) · [Terrain and hillshade →](./06-terrain.md)
