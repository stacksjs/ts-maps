/**
 * The Transit map, after Apple's: streets quietened, rail and tram lines
 * drawn strong in a colour per kind, and stations named.
 *
 * Lines come from OpenMapTiles' `transportation` layer (class `rail` and
 * `transit`, by subclass), stations from its `poi` layer (class `railway`
 * and `bus`). Tiles carry no agency colours, so a kind of line has one.
 */

import type { Style as StyleSpec } from '../style-spec/types'
import type { BasemapStyleOptions } from './basemap'
import { dark, light } from './basemap'

/** A colour per kind of line. */
export const TRANSIT_COLORS: Record<string, string> = {
  subway: '#0a84ff',
  light_rail: '#af52de',
  tram: '#34c759',
  monorail: '#ff9f0a',
  funicular: '#ff9f0a',
  narrow_gauge: '#8e8e93',
  rail: '#636366',
}

const STATIONS = ['station', 'halt', 'subway', 'tram_stop', 'subway_entrance', 'train_station']

export function transit(options: BasemapStyleOptions & { theme?: 'light' | 'dark' }): StyleSpec {
  const isDark = options.theme === 'dark'
  const base = (isDark ? dark : light)({ ...options, name: options.name ?? 'ts-maps transit' })
  const source = Object.keys(base.sources)[0]!
  const layer = (id: string): any => (base.layers as any[]).find(l => l.id === id)
  const transportation = layer('road-major')?.['source-layer'] ?? 'transportation'
  const poi = layer('poi')?.['source-layer'] ?? 'poi'

  // Streets recede: one muted colour for every class.
  for (const id of ['road-major', 'road-minor']) {
    const road = layer(id)
    if (road)
      road.paint['line-color'] = isDark ? '#2a2e37' : '#f2f0eb'
  }
  // Points of interest give way to stations.
  const pois = layer('poi')
  if (pois)
    pois.minzoom = 17

  const kind = ['coalesce', ['get', 'subclass'], ['get', 'class']]
  const color: unknown[] = ['match', kind]
  for (const [k, c] of Object.entries(TRANSIT_COLORS))
    color.push(k, c)
  color.push(TRANSIT_COLORS.rail)
  const lines = [
    {
      id: 'transit-casing',
      type: 'line',
      source,
      'source-layer': transportation,
      minzoom: 8,
      filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': isDark ? '#12141a' : '#ffffff', 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 2, 14, 5, 18, 12] },
    },
    {
      id: 'transit-line',
      type: 'line',
      source,
      'source-layer': transportation,
      minzoom: 8,
      filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 1, 14, 3, 18, 8] },
    },
    {
      id: 'transit-station',
      type: 'circle',
      source,
      'source-layer': poi,
      minzoom: 12,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['railway', 'bus']]], ['in', ['coalesce', ['get', 'subclass'], ''], ['literal', STATIONS]]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 6],
        'circle-color': '#ffffff',
        'circle-stroke-color': isDark ? '#8e8e93' : '#3a3a3c',
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'transit-station-label',
      type: 'symbol',
      source,
      'source-layer': poi,
      minzoom: 13,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['railway', 'bus']]], ['in', ['coalesce', ['get', 'subclass'], ''], ['literal', STATIONS]], ['has', 'name']],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Semibold'], 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.8], 'text-max-width': 8 },
      paint: { 'text-color': isDark ? '#f2f2f7' : '#1d1d1f', 'text-halo-color': isDark ? '#12141a' : '#ffffff', 'text-halo-width': 1.5 },
    },
  ]
  // Lines over the streets and under the buildings; stations with the labels.
  const layers = [...base.layers] as any[]
  const buildings = layers.findIndex(l => l.id === 'building')
  layers.splice(buildings >= 0 ? buildings : layers.length, 0, lines[0], lines[1])
  const firstLabel = layers.findIndex(l => l.type === 'symbol')
  layers.splice(firstLabel >= 0 ? firstLabel : layers.length, 0, lines[2])
  layers.push(lines[3])
  return { ...base, layers: layers as StyleSpec['layers'] }
}
