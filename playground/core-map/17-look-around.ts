/**
 * Phase 17 demo — Look Around, after Apple Maps.
 *
 * Wildloop's basemap over Paris, with street-level pictures from Panoramax
 * (open, no key). The binoculars button shows the streets with pictures in
 * blue; tap one to look around, drag to turn, tap ahead to walk. Search a
 * place and its card offers the pictures near it.
 *
 * `?lat=…&lng=…&zoom=…` override the starting view; `?mapillary=<token>`
 * uses Mapillary instead.
 */

import { control, LookAround, MapillaryImagery, PanoramaxImagery, TsMap } from '../../packages/ts-maps/src/core-map'
import { loadBasemap } from './basemap'

const params = new URLSearchParams(location.search)
const map = new TsMap('map', {
  center: [Number(params.get('lat') ?? 48.8606), Number(params.get('lng') ?? 2.3376)],
  zoom: Number(params.get('zoom') ?? 16),
  maxZoom: 19,
  zoomControl: false,
})
control.navigation().addTo(map)

const token = params.get('mapillary')
const provider = token ? new MapillaryImagery({ accessToken: token }) : new PanoramaxImagery()
const look = new LookAround({ provider }).addTo(map)

void loadBasemap(map, 'light').then(() => {
  control.search({ lookAround: look }).addTo(map)
})

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, look }
