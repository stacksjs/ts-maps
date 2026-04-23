# ts-maps docs

Markdown docs + `bunpress` site generator.

```sh
bun run dev:docs        # dev server with hot reload
bun run build:docs      # static build
bun run preview:docs    # preview the built output
```

Layout:

- `index.md` — landing page (bunpress home layout).
- `intro.md`, `install.md`, `usage.md` — orientation pages.
- `getting-started.md` — first-map walkthrough.
- `concepts/` — map, layers, style spec, services, offline.
- `api/` — hand-written API reference (TsMap, geometry, layer, expressions).
- `examples/` — twelve runnable demos. Each `NN-<name>.md` documents the demo and the matching `NN-<name>.ts` is the actual runnable source.
- `guide/`, `features/`, `advanced/`, `components/` — topical guides.
- `credits.md` — attribution for Leaflet and Mapbox GL Style Spec.

Plus the standard stacksjs top-level pages (`team.md`, `sponsors.md`, `showcase.md`, etc.).
