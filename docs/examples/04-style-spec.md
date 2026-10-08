# 04 · Style spec

Data of your own on the basemap, through the style: a GeoJSON source, a fill and a line layer over it, and their paint changed at runtime. Layers are added on `style.load`, once the basemap's style is in place, since setting a style replaces what was there.

<iframe class="ts-maps-demo" src="/playground/examples/04-style-spec.html" title="Style spec, running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/04-style-spec.html) · [Edit and run it](/playground/examples/edit.html?example=04-style-spec) · Full source: [`04-style-spec.ts`](./04-style-spec.ts)

```ts
map.on('style.load', () => {
  map.addSource('midtown', { type: 'geojson', data: polygon })
  map.addStyleLayer({ id: 'midtown-fill', type: 'fill', source: 'midtown', paint: { 'fill-color': '#4f46e5', 'fill-opacity': 0.2 } })
  map.addStyleLayer({ id: 'midtown-line', type: 'line', source: 'midtown', paint: { 'line-color': '#4f46e5', 'line-width': 3 } })
})

map.setPaintProperty('midtown-fill', 'fill-color', '#e11d48')
```

---

[← Vector tiles, styled from scratch](./03-vector-tile.md) · [Heatmap →](./05-heatmap.md)
