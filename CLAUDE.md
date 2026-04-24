# Claude Code Guidelines

## About

A zero-dependency, TypeScript-native interactive mapping library. Mapbox-class feature set (vector tiles + Mapbox GL Style Spec subset, expressions, 3D fill-extrusion + terrain + fog/sky, globe projection, collision-aware symbol labels, WebGL renderer) with a Leaflet-style ergonomic API. Ships geocoding / directions / matrix adapters, offline tile caching, and official React, Vue, Svelte, Solid, Nuxt, and React-Native bindings.

## Linting

- Use **pickier** for linting — never use eslint directly
- Run `bunx --bun pickier .` to lint, `bunx --bun pickier . --fix` to auto-fix
- When fixing unused variable warnings, prefer `// eslint-disable-next-line` comments over prefixing with `_`

## Frontend

- Framework bindings live under `packages/react`, `packages/vue`,
  `packages/svelte`, `packages/solid`, `packages/nuxt`, and
  `packages/react-native`. When touching one, keep them in parity:
  same component names, same prop shape, same event names.
- `packages/ts-maps/src/core-map/` is the implementation. Everything
  else is a thin wrapper; avoid forking logic into bindings.
- Docs are built with `@stacksjs/bunpress`; follow the file layout in
  `docs/`.

## Dependencies

- **buddy-bot** handles dependency updates — not renovatebot
- **better-dx** provides shared dev tooling as peer dependencies — do not install its peers (e.g., `typescript`, `pickier`, `bun-plugin-dtsx`) separately if `better-dx` is already in `package.json`
- If `better-dx` is in `package.json`, ensure `bunfig.toml` includes `linker = "hoisted"`

## Commits

- Use conventional commit messages (e.g., `fix:`, `feat:`, `chore:`)
