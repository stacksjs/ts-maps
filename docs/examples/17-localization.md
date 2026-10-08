# 17 · Localization

The same controls in German: search and its categories, the map type picker, Offline Maps and the zoom buttons. `locale` on the map sets the language of every control on it; a control's own `locale` wins. English and German are built in, and `addMessages` adds another. See [Localization](../concepts/localization.md).

<iframe class="ts-maps-demo" src="/playground/examples/17-localization.html" title="Localization, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/17-localization.html) · [Edit and run it](/playground/examples/edit.html?example=17-localization) · Full source: [`17-localization.ts`](./17-localization.ts)

```ts
const map = new Map('map', { center: [52.52, 13.405], zoom: 14, locale: 'de', style })
control.search().addTo(map)  // "Karten durchsuchen"
control.mapType({ types: mapTypes({ url }) }).addTo(map)
```

---

[← Look Around](./16-look-around.md) · [Examples →](./index.md)
