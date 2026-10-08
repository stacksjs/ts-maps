/**
 * Example 17 — Localization.
 *
 * The same map in German: search and its categories, the map type picker,
 * Offline Maps and the zoom buttons. `locale` on the map sets the language of
 * every control on it; a control's own `locale` wins over it. Built in:
 * English and German; `addMessages` adds another.
 */

import { control, mapTypes, styles, TsMap } from '../../packages/ts-maps/src/core-map'

const BASEMAP = 'https://tiles.openfreemap.org/planet'
const locale = new URLSearchParams(location.search).get('lang') ?? 'de'

const map = new TsMap('map', {
  center: [52.5200, 13.4050], // Berlin
  zoom: 14,
  locale,
  zoomControl: false,
  style: styles.light({ url: BASEMAP }),
})

control.navigation().addTo(map)
control.search().addTo(map)
control.mapType({ types: mapTypes({ url: BASEMAP }) }).addTo(map)
control.offlineMaps().addTo(map)

// The panel's links reload the page in the other language.
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-lang]'))
  link.classList.toggle('active', link.dataset.lang === locale)

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
