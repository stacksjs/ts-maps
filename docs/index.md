---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "ts-maps"
  text: "Interactive maps in TypeScript"
  tagline: "Vector basemaps, 3D, a globe, search, directions and offline maps, with no dependencies. Leaflet's API, the Mapbox style spec."
  image: /images/logo-white.png
  actions:
    - theme: brand
      text: Get Started
      link: /intro
    - theme: alt
      text: View on GitHub
      link: https://github.com/stacksjs/ts-maps

features:
  - title: "A basemap with no key"
    icon: "🗺️"
    details: "styles.light and styles.dark draw any OpenMapTiles source, such as OpenFreeMap's free planet. Tiles are decoded on worker threads; labels are placed without overlapping and stay upright as the map turns."
  - title: "The Mapbox style spec"
    icon: "🧱"
    details: "Sources and style layers — fill, line, circle, symbol, fill-extrusion, heatmap, hillshade — with data-driven expressions, filters, feature state and queryRenderedFeatures."
  - title: "Camera"
    icon: "🎥"
    details: "Fractional zoom, rotation, and tilt to 85° with a sky at the horizon. flyTo, easeTo and jumpTo, and two-finger twist and tilt on touch screens."
  - title: "3D"
    icon: "🏙️"
    details: "Extruded buildings with roofs, glTF landmarks and trees, drawn together in WebGL so each hides what is behind it. Hillshading and ground heights from elevation tiles, fog, sky, and custom WebGL layers."
  - title: "The globe"
    icon: "🌍"
    details: "projection: 'globe' draws a WebGL sphere textured with the same tiles as the flat map, and fades into the flat map between zoom 5.5 and 6. Labels and markers ride it."
  - title: "Search"
    icon: "🔎"
    details: "control.search(): suggestions as you type, Find Nearby, a pin per result and a card for each place, with opening hours, directions and saved places. Keyless geocoders by default."
  - title: "Directions and turn-by-turn"
    icon: "🧭"
    details: "Routes from OSRM or Valhalla with no key, and transit from an OpenTripPlanner server. turnByTurn(map) adds the route choices, a banner, lane guidance, a voice and a camera that follows."
  - title: "Offline maps"
    icon: "📴"
    details: "Download an area with control.offlineMaps() or map.offline. Its tiles, fonts, places and roads are kept in the browser, so the map, search and directions work with no connection."
  - title: "Map types and traffic"
    icon: "🛰️"
    details: "Explore, Driving, Transit and Satellite from one basemap, with control.mapType(). Live traffic from Mapbox or TomTom flow tiles, and TomTom incidents, with your key."
  - title: "Indoor maps and Look Around"
    icon: "🏢"
    details: "Floor plans from IMDF venues, a level at a time, searchable by name. Street-level imagery from Panoramax or Mapillary, to look around and walk through."
  - title: "Your own tiles"
    icon: "🗄️"
    details: "pmtiles:// archives read in place, with no tile server. Or serve one: ts-maps/server for Bun, ts-maps/worker for Cloudflare. ts-maps/gazetteer for your own place search."
  - title: "Localization"
    icon: "🌐"
    details: "One locale option sets the language of every control, turn-by-turn and its voice. English and German built in; addMessages adds another."
  - title: "Framework bindings"
    icon: "🧩"
    details: "React, Vue, Svelte, Solid, Nuxt, React Native and stx, with the same component names, props and events in each."
---
