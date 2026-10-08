# 09 · Search

Apple Maps' search box in one line: suggestions as you type, Find Nearby, a pin for every result and a card for the place you choose, with its hours, Directions and Save. Answers come from the map's own tiles and from Photon, OpenStreetMap's geocoder. See [the search control](/concepts/controls#search) for its options.

<iframe class="ts-maps-demo" src="/playground/examples/09-search.html" title="Search, running" loading="lazy" style="width: 100%; height: 480px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/09-search.html) · [Edit and run it](/playground/examples/edit.html?example=09-search) · Full source: [`09-search.ts`](./09-search.ts)

```ts
control.search().addTo(map)

// Or ask the geocoder yourself:
const results = await services.defaultGeocoder().search('Tate Modern', { limit: 5 })
```

---

[← Symbols with collision](./08-symbols.md) · [Turn-by-turn →](./10-turn-by-turn.md)
