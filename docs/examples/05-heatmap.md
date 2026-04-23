# 05 · Heatmap

A `HeatmapLayer` over 500 synthetic points, with the colour ramp cycled every 2.5 seconds. `radius`, `blur` and `gradient` are all reactive — call `layer.redraw()` after mutating options.

Full source: [`05-heatmap.ts`](./05-heatmap.ts)

```ts
const heat = new HeatmapLayer({
  data: points,
  radius: 25,
  blur: 20,
  gradient: { 0.4: 'blue', 0.8: 'yellow', 1.0: 'red' },
})
heat.addTo(map)
```

---

[← Style spec](./04-style-spec.md) · [Hillshade →](./06-hillshade.md)
