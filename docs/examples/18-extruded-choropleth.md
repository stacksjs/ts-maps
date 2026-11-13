# 18 · Extruded choropleth

Polygons of your own stood up as prisms, with no basemap: a GeoJSON source and a `fill-extrusion` layer whose height and colour come from each feature's properties. Point at a prism and it is found by the face it shows, not by the ground behind it. The numbers stand on the roofs, on markers given an `altitude`. See [3D: your own data](../concepts/3d.md#your-own-data).

<iframe class="ts-maps-demo" src="/playground/examples/18-extruded-choropleth.html" title="Extruded choropleth, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #0b0f17;"></iframe>

[Open it full screen](/playground/examples/18-extruded-choropleth.html) · [Edit and run it](/playground/examples/edit.html?example=18-extruded-choropleth) · Full source: [`18-extruded-choropleth.ts`](./18-extruded-choropleth.ts)

```ts
map.addSource('cells', { type: 'geojson', data, promoteId: 'code' })
map.addStyleLayer({
  id: 'prisms',
  type: 'fill-extrusion',
  source: 'cells',
  paint: {
    'fill-extrusion-height': ['*', 0.25, ['get', 'value']],
    'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'lean'], -0.5, '#b91c1c', 0.5, '#1d4ed8'],
    'fill-extrusion-vertical-gradient': false,
    'fill-extrusion-fade-range': [0, 0],
  },
})

// On the roof of a prism 200 km high.
marker([5, 7], { altitude: 200_000, icon }).addTo(map)

// The prism under the pointer.
const [hit] = map.queryRenderedFeatures(e.containerPoint, { layers: ['prisms'] })
```

---

[← Localization](./17-localization.md) · [Examples →](./index.md)
