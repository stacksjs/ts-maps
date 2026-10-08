# 09 · Geocoder (Nominatim)

Search anywhere on earth via the default `NominatimGeocoder`. Please respect [Nominatim's usage policy](https://operations.osmfoundation.org/policies/nominatim/) in production — set a `User-Agent` and cache results.

<iframe class="ts-maps-demo" src="/playground/examples/09-geocoder.html" title="09 · Geocoder (Nominatim), running" loading="lazy" style="width: 100%; height: 440px; border: 0; border-radius: 12px; background: #e8eaed;"></iframe>

[Open it full screen](/playground/examples/09-geocoder.html) · Full source: [`09-geocoder.ts`](./09-geocoder.ts)

```ts
const geocoder = services.defaultGeocoder()
const results = await geocoder.search(q, { limit: 6 })
// → [{ text, center: { lat, lng }, bbox, placeType }, …]
```

---

[← Symbols](./08-symbols.md) · [Directions →](./10-directions.md)
