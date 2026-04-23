---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "ts-maps"
  text: "Zero-dep Mapbox-class maps"
  tagline: "Zero-dependency, TypeScript-native, interactive mapping — Mapbox-class features with a Leaflet-style API."
  image: /images/logo-white.png
  actions:
    - theme: brand
      text: Get Started
      link: /intro
    - theme: alt
      text: View on GitHub
      link: https://github.com/stacksjs/ts-maps

features:
  - title: "Interactive slippy maps"
    icon: "🗺️"
    details: "TsMap with fractional zoom, bearing, pitch, and unified flyTo / easeTo / jumpTo camera animations."
  - title: "Vector tiles + style spec"
    icon: "🧱"
    details: "In-house MVT decoder, Mapbox GL Style Spec subset, and a full expression engine."
  - title: "3D & terrain"
    icon: "🏔️"
    details: "fill-extrusion, setFog, setSky, DEM-based setTerrain, and a CustomLayerInterface."
  - title: "Globe"
    icon: "🌍"
    details: "Seamless Mercator-to-globe transition around zoom 5.5, with an atmosphere halo."
  - title: "Services"
    icon: "🧭"
    details: "Keyless geocoding, directions, isochrones, and distance matrix. Mapbox / Google / Maptiler / Photon opt-in."
  - title: "Offline"
    icon: "📴"
    details: "IndexedDB-backed TileCache, saveOfflineRegion pre-fetcher, and a worker pool for tile decode."
  - title: "Zero runtime deps"
    icon: "🎯"
    details: "Subpath exports (ts-maps/services, ts-maps/style-spec, ...) let you pull in just one slice."
  - title: "Framework bindings"
    icon: "🧩"
    details: "Official React, Vue, Svelte, Solid, Nuxt, and React-Native bindings."
---
