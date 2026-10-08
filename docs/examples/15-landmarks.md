# 15 · Landmarks and trees

A glTF model stands in for its building, as Apple Maps shows famous ones: lit, fogged and depth-tested with the extruded buildings, which leave out the box it replaces. Trees are planted in the basemap's woods once the map tilts: fly to the Presidio to see them. [`data/transamerica.ts`](./data/transamerica.ts) builds the model in code; a `.glb` URL works the same.

<iframe class="ts-maps-demo" src="/playground/examples/15-landmarks.html" title="Landmarks and trees, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/15-landmarks.html) · [Edit and run it](/playground/examples/edit.html?example=15-landmarks) · Full source: [`15-landmarks.ts`](./15-landmarks.ts)

```ts
landmark({ model: '/models/transamerica.glb', position: [37.7952, -122.4028] }).addTo(map)
trees().addTo(map)
```

---

[← Indoor maps](./14-indoor.md) · [Look Around →](./16-look-around.md)
