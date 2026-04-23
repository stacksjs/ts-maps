# 10 · Directions (OSRM)

Click two points; the default `OSRMDirections` provider requests a route from the public demo server and draws the resulting geometry as a polyline. Swap for `ValhallaDirections` or any custom provider without changing the call site.

Full source: [`10-directions.ts`](./10-directions.ts)

```ts
const directions = services.defaultDirections()
const routes = await directions.getDirections(
  [start, end],
  { profile: 'driving' },
)
new Polyline(routes[0].geometry, { color: '#4f46e5', weight: 4 }).addTo(map)
```

---

[← Geocoder](./09-geocoder.md) · [Offline →](./11-offline.md)
