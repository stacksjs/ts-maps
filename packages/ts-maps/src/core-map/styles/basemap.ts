import type { Style as StyleSpec } from '../style-spec/types'
import type { Palette } from './palette'
import { DARK, LIGHT } from './palette'

/**
 * Built-in basemap styles.
 *
 * These are functions rather than constants because ts-maps ships no tile
 * service: a style is only meaningful once it is pointed at a source. Call
 * `styles.dark({ tiles })` with a vector tile URL and you get a complete
 * StyleSpec; the palette, layer order and zoom ramps are the parts worth not
 * hand-writing.
 *
 * Layer names default to the OpenMapTiles schema, which is what the keyless
 * public services publish (OpenFreeMap, MapTiler, a self-hosted Tileserver
 * GL). A source using different names — Mapbox Streets, say — is accommodated
 * by `sourceLayers` rather than by forking the style.
 */
export interface BasemapStyleOptions {
  /**
   * Tile URL template(s) with `{z}/{x}/{y}`. Required for `mode: 'vector'`
   * (the default) and for raster.
   */
  tiles: string | string[]
  /**
   * `'vector'` builds the full styled basemap. `'raster'` wraps pre-rendered
   * image tiles in a one-layer style — the fallback for a source that only
   * publishes pictures, where none of the palette applies.
   */
  mode?: 'vector' | 'raster'
  /** Required by most tile services, and rendered by AttributionControl. */
  attribution?: string
  minzoom?: number
  maxzoom?: number
  /** Tile size in px. Vector defaults to 512, raster to 256. */
  tileSize?: number
  /** Remap OpenMapTiles source-layer names onto another schema. */
  sourceLayers?: Partial<Record<SourceLayerKey, string>>
  /** Overrides for individual palette entries. */
  palette?: Partial<Palette>
  name?: string
  glyphs?: string
  sprite?: string
}

export type SourceLayerKey
  = | 'water'
    | 'landcover'
    | 'landuse'
    | 'building'
    | 'transportation'
    | 'transportationName'
    | 'boundary'
    | 'place'

const OPENMAPTILES: Record<SourceLayerKey, string> = {
  water: 'water',
  landcover: 'landcover',
  landuse: 'landuse',
  building: 'building',
  transportation: 'transportation',
  transportationName: 'transportation_name',
  boundary: 'boundary',
  place: 'place',
}

const SOURCE_ID = 'basemap'

function rasterStyle(palette: Palette, options: BasemapStyleOptions, name: string): StyleSpec {
  const tiles = Array.isArray(options.tiles) ? options.tiles : [options.tiles]
  return {
    version: 8,
    name,
    sources: {
      [SOURCE_ID]: {
        type: 'raster',
        tiles,
        tileSize: options.tileSize ?? 256,
        minzoom: options.minzoom ?? 0,
        maxzoom: options.maxzoom ?? 19,
        attribution: options.attribution,
      },
    },
    layers: [
      // Painted behind the tiles so a slow or missing tile shows the theme's
      // ground colour rather than a bright gap.
      { id: 'background', type: 'background', paint: { 'background-color': palette.background } },
      { id: 'basemap', type: 'raster', source: SOURCE_ID, paint: { 'raster-opacity': 1 } },
    ],
  }
}

function vectorStyle(palette: Palette, options: BasemapStyleOptions, name: string): StyleSpec {
  const tiles = Array.isArray(options.tiles) ? options.tiles : [options.tiles]
  const layer = { ...OPENMAPTILES, ...options.sourceLayers }

  return {
    version: 8,
    name,
    ...(options.glyphs ? { glyphs: options.glyphs } : {}),
    ...(options.sprite ? { sprite: options.sprite } : {}),
    sources: {
      [SOURCE_ID]: {
        type: 'vector',
        tiles,
        minzoom: options.minzoom ?? 0,
        maxzoom: options.maxzoom ?? 14,
        attribution: options.attribution,
      },
    },
    // Order is the whole game in a basemap: ground, areas, water, roads,
    // buildings, boundaries, labels. Anything out of order either buries a
    // feature or floats it over one it should sit under.
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': palette.background },
      },
      {
        id: 'landcover',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': layer.landcover,
        paint: { 'fill-color': palette.green, 'fill-opacity': 0.8 },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': layer.landuse,
        paint: { 'fill-color': palette.land },
      },
      {
        id: 'water',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': layer.water,
        paint: { 'fill-color': palette.water },
      },
      // Casing under fill, both drawn for every road class: this is what makes
      // a junction read as two roads crossing rather than one blob.
      {
        id: 'road-casing',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': layer.transportation,
        minzoom: 6,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': palette.roadCasing,
          'line-width': [
            'interpolate',
            ['exponential', 1.5],
            ['zoom'],
            6,
            1.5,
            12,
            4,
            16,
            14,
            20,
            42,
          ],
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': layer.transportation,
        minzoom: 11,
        filter: ['!', ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': palette.roadMinor,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 0.75, 16, 6, 20, 24],
        },
      },
      {
        id: 'road-major',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': layer.transportation,
        minzoom: 6,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': palette.roadMajor,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6, 1, 12, 3, 16, 10, 20, 32],
        },
      },
      {
        id: 'building',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': layer.building,
        minzoom: 13,
        paint: {
          'fill-color': palette.buildings,
          // Faded in rather than switched on, so the 13/14 boundary is not a
          // visible pop while zooming.
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 1],
        },
      },
      {
        id: 'boundary',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': layer.boundary,
        filter: ['<=', ['get', 'admin_level'], 4],
        paint: {
          'line-color': palette.boundary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 10, 1.5],
          'line-dasharray': [3, 2],
        },
      },
      // Labels last, and road names before place names: a street name losing
      // its slot to a neighbourhood name is the right outcome when they
      // collide.
      {
        id: 'road-label',
        type: 'symbol',
        source: SOURCE_ID,
        'source-layer': layer.transportationName,
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 18, 13],
          'symbol-placement': 'line',
          'text-max-angle': 45,
          'symbol-spacing': 250,
        },
        paint: {
          'text-color': palette.labelMuted,
          'text-halo-color': palette.labelHalo,
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: SOURCE_ID,
        'source-layer': layer.place,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 10, 14, 16, 18],
          'text-anchor': 'center',
          // Places outrank road names when the collision index has to choose.
          'symbol-sort-key': 1,
        },
        paint: {
          'text-color': palette.label,
          'text-halo-color': palette.labelHalo,
          'text-halo-width': 1.5,
        },
      },
    ] as StyleSpec['layers'],
  }
}

function build(base: Palette, options: BasemapStyleOptions, name: string): StyleSpec {
  const palette: Palette = { ...base, ...options.palette }
  return options.mode === 'raster'
    ? rasterStyle(palette, options, name)
    : vectorStyle(palette, options, name)
}

/** The dark basemap. Pair it with `theme: 'dark'` so the chrome matches. */
export function dark(options: BasemapStyleOptions): StyleSpec {
  return build(DARK, options, options.name ?? 'ts-maps dark')
}

/** The light basemap. The default `theme: 'light'` chrome already matches. */
export function light(options: BasemapStyleOptions): StyleSpec {
  return build(LIGHT, options, options.name ?? 'ts-maps light')
}
