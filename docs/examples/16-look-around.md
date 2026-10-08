# 16 · Look Around

Street-level pictures you can turn in and walk through, from [Panoramax](https://panoramax.fr), the open street-level imagery project (no key). The binoculars show the streets with pictures in blue; tap one to look from there. Drag to turn, tap ahead or use the arrows to walk, and Done to come back to the map.

<iframe class="ts-maps-demo" src="/playground/examples/16-look-around.html" title="Look Around, running" loading="lazy" style="width: 100%; height: 520px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/16-look-around.html) · [Edit and run it](/playground/examples/edit.html?example=16-look-around) · Full source: [`16-look-around.ts`](./16-look-around.ts)

```ts
const look = lookAround().addTo(map)
look.open([48.86145, 2.33458], { heading: 100 })

// A place card can offer it too:
control.search({ lookAround: look }).addTo(map)
```

---

[← Landmarks and trees](./15-landmarks.md) · [Localization →](./17-localization.md)
