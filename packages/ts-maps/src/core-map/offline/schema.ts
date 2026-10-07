/**
 * What a vector tile schema calls things, for search and routing.
 *
 * Search reads place names out of the tiles the map has loaded, and offline
 * search and routing read names and roads out of downloaded tiles. Tile
 * schemas agree on what is in a street map but not on what to call it: the
 * place layer is `place` in OpenMapTiles, `places` in Protomaps,
 * `place_labels` in Shortbread and `place_label` in Mapbox Streets, and a
 * primary road is `class: 'primary'`, `kind_detail: 'primary'`,
 * `kind: 'primary'` or `class: 'primary'` again. A schema says where each
 * role lives and reads its attributes into one vocabulary, OpenMapTiles':
 * place kinds (`city`, `suburb`), POI kinds (`cafe`), road classes
 * (`motorway` … `minor`, `service`, `track`, `path:footway`).
 *
 * `detectSchema` picks one from a tile's layer names, so most apps never
 * name one.
 */

export type Props = Record<string, unknown>

export interface TileSchema {
  name: string
  /** Layers of named places: countries, cities, neighbourhoods. */
  places: string[]
  /** Layers of points of interest. */
  pois: string[]
  /** Layers of named water: seas, lakes, rivers. */
  waters: string[]
  /** Layers of named parks. */
  parks: string[]
  /** Layers of named peaks. */
  peaks: string[]
  /** Layers of airports. */
  airports: string[]
  /**
   * Layers whose lines carry street names. In OpenMapTiles a layer of its
   * own, merged for labelling; elsewhere the road layer itself.
   */
  streetNames: string[]
  /** Layers of the road network. */
  roads: string[]
  /** Whether a road feature carries its own street name. */
  namedRoads: boolean
  /** `city`, `town`, `suburb`, `neighbourhood`… */
  placeKind: (props: Props) => string
  /** Lower is more important; undefined to go by kind. */
  placeRank: (props: Props) => number | undefined
  /** `cafe`, `restaurant`, `fuel`… */
  poiKind: (props: Props) => string
  /** Lower is more important, 0–60-ish; undefined for the middle. */
  poiRank: (props: Props) => number | undefined
  /** The OpenMapTiles road class, or undefined for a feature that is not a road. */
  roadKind: (props: Props) => string | undefined
  oneway: (props: Props) => 0 | 1 | -1
  ramp: (props: Props) => boolean
  /** Above or below the ground: bridges 1 and up, tunnels -1 and down. */
  level: (props: Props) => number
  /** The water feature's kind: `lake`, `river`, `sea`… */
  waterKind: (props: Props) => string
  /** Who may use a road. Everyone, where the schema does not say. */
  access: (props: Props) => RoadAccess
  /** What a service road is for: `driveway`, `parking_aisle`, `alley`… */
  service: (props: Props) => string | undefined
}

export interface RoadAccess {
  car: boolean
  foot: boolean
  bicycle: boolean
}

const EVERYONE: RoadAccess = { car: true, foot: true, bicycle: true }
const CLOSED = /^(?:no|private|customers|delivery|agricultural|forestry|military)$/

/**
 * OpenStreetMap's access tags, as tiles carry them: `access` for everyone,
 * `foot` and `bicycle` overriding it for theirs. A pedestrian street closed
 * to traffic is open on foot.
 */
function osmAccess(props: Props): RoadAccess {
  const all = str(props.access)
  const closed = all !== undefined && CLOSED.test(all)
  const mode = (key: string): boolean => {
    const value = str(props[key])
    return value === undefined ? !closed : !CLOSED.test(value)
  }
  return { car: !closed && mode('motor_vehicle'), foot: mode('foot'), bicycle: mode('bicycle') }
}

const str = (v: unknown): string | undefined => typeof v === 'string' && v ? v : undefined
const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined
const yes = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'yes' || v === 'true'

function oneway(props: Props): 0 | 1 | -1 {
  const v = props.oneway
  if (v === -1 || v === '-1' || yes(props.oneway_reverse))
    return -1
  return yes(v) ? 1 : 0
}

/** An OpenStreetMap `highway` value as an OpenMapTiles road class, the way OpenMapTiles itself maps it. */
export function roadClassForHighway(highway: string | undefined): string | undefined {
  if (!highway)
    return undefined
  const base = highway.replace(/_link$/, '')
  switch (base) {
    case 'motorway':
    case 'trunk':
    case 'primary':
    case 'secondary':
    case 'tertiary':
      return base
    case 'unclassified':
    case 'residential':
    case 'living_street':
    case 'road':
    case 'street':
    case 'street_limited':
      return 'minor'
    case 'service':
      return 'service'
    case 'track':
      return 'track'
    case 'pedestrian':
    case 'footway':
    case 'path':
    case 'cycleway':
    case 'bridleway':
    case 'steps':
    case 'sidewalk':
    case 'crossing':
      return base === 'path' ? 'path:path' : `path:${base === 'sidewalk' || base === 'crossing' ? 'footway' : base}`
    default:
      return undefined
  }
}

const isLink = (v: unknown): boolean => typeof v === 'string' && v.endsWith('_link')

/** The OpenMapTiles schema: what OpenFreeMap, MapTiler and planetiler publish, and the default. */
export const OPENMAPTILES: TileSchema = {
  name: 'openmaptiles',
  places: ['place'],
  pois: ['poi'],
  waters: ['water_name'],
  parks: ['park'],
  peaks: ['mountain_peak'],
  airports: ['aerodrome_label'],
  streetNames: ['transportation_name'],
  roads: ['transportation'],
  namedRoads: false,
  placeKind: p => str(p.class) ?? 'place',
  placeRank: p => num(p.rank),
  poiKind: p => str(p.subclass) ?? str(p.class) ?? 'poi',
  poiRank: p => num(p.rank),
  roadKind: (p) => {
    const kind = str(p.class) ?? 'minor'
    if (/^(?:rail|transit|ferry|cable_car|aerialway|bus_guideway|raceway)$/.test(kind) || kind.endsWith('_construction'))
      return undefined
    return kind === 'path' && p.subclass ? `path:${p.subclass}` : kind
  },
  oneway,
  ramp: p => yes(p.ramp),
  level: p => num(p.layer) || (p.brunnel === 'bridge' ? 1 : p.brunnel === 'tunnel' ? -1 : 0),
  waterKind: p => str(p.class) ?? 'water',
  access: osmAccess,
  service: p => str(p.service),
}

/** Protomaps' basemap schema (v4), as its PMTiles builds publish it. */
export const PROTOMAPS: TileSchema = {
  name: 'protomaps',
  places: ['places'],
  pois: ['pois'],
  waters: ['water'],
  // Parks, peaks and airports are POIs here, with their own kinds.
  parks: [],
  peaks: [],
  airports: [],
  streetNames: ['roads'],
  roads: ['roads'],
  namedRoads: true,
  placeKind: (p) => {
    const kind = str(p.kind)
    const detail = str(p.kind_detail)
    if (kind === 'region')
      return 'state'
    if (kind === 'locality')
      return detail && /^(?:city|town|village|hamlet)$/.test(detail) ? detail : 'city'
    if (kind === 'macrohood')
      return 'suburb'
    if (kind === 'microhood')
      return 'neighbourhood'
    return detail ?? kind ?? 'place'
  },
  // Protomaps ranks by population, 0 the fewest.
  placeRank: p => num(p.population_rank) === undefined ? undefined : Math.max(0, 18 - num(p.population_rank)!),
  poiKind: p => str(p.kind) ?? 'poi',
  poiRank: p => num(p.min_zoom) === undefined ? undefined : Math.max(0, (num(p.min_zoom)! - 12) * 10),
  roadKind: (p) => {
    const kind = str(p.kind)
    if (kind !== 'highway' && kind !== 'major_road' && kind !== 'medium_road' && kind !== 'minor_road' && kind !== 'path')
      return undefined
    return roadClassForHighway(str(p.kind_detail))
      ?? (kind === 'highway' ? 'motorway' : kind === 'major_road' ? 'primary' : kind === 'medium_road' ? 'tertiary' : kind === 'path' ? 'path:path' : 'minor')
  },
  oneway,
  ramp: p => yes(p.is_link) || isLink(p.kind_detail),
  level: p => num(p.level) || (yes(p.is_bridge) ? 1 : yes(p.is_tunnel) ? -1 : 0),
  waterKind: p => str(p.kind) ?? 'water',
  access: () => EVERYONE,
  service: p => str(p.kind_detail) === 'service' ? str(p.service) : undefined,
}

/** The keys Shortbread files a POI under, most telling first. */
const SHORTBREAD_POI_KEYS = ['amenity', 'shop', 'tourism', 'leisure', 'historic', 'man_made', 'office', 'emergency', 'highway']

/** Shortbread (v1), as the VersaTiles and Geofabrik builds publish it. */
export const SHORTBREAD: TileSchema = {
  name: 'shortbread',
  places: ['place_labels'],
  pois: ['pois'],
  waters: ['water_polygons_labels', 'water_lines_labels'],
  parks: [],
  peaks: [],
  airports: [],
  streetNames: ['street_labels'],
  roads: ['streets'],
  namedRoads: true,
  placeKind: (p) => {
    const kind = str(p.kind) ?? 'place'
    return kind === 'capital' || kind === 'state_capital' ? 'city' : kind
  },
  placeRank: () => undefined,
  poiKind: p => SHORTBREAD_POI_KEYS.map(key => str(p[key])).find(Boolean) ?? 'poi',
  poiRank: () => undefined,
  roadKind: p => roadClassForHighway(str(p.kind)),
  oneway,
  ramp: p => yes(p.link),
  level: p => num(p.layer) || (yes(p.bridge) ? 1 : yes(p.tunnel) ? -1 : 0),
  waterKind: p => str(p.kind) ?? 'water',
  access: osmAccess,
  service: p => str(p.service),
}

/** Mapbox Streets v8. */
export const MAPBOX_STREETS: TileSchema = {
  name: 'mapbox-streets-v8',
  places: ['place_label'],
  pois: ['poi_label'],
  waters: ['natural_label'],
  parks: [],
  peaks: [],
  airports: ['airport_label'],
  streetNames: ['road'],
  roads: ['road'],
  namedRoads: true,
  placeKind: (p) => {
    const type = str(p.type)?.toLowerCase()
    if (type)
      return type
    const cls = str(p.class)
    return cls === 'settlement' ? 'city' : cls === 'settlement_subdivision' ? 'suburb' : cls ?? 'place'
  },
  placeRank: p => num(p.symbolrank),
  poiKind: p => str(p.maki) ?? str(p.type)?.toLowerCase() ?? str(p.class) ?? 'poi',
  poiRank: p => num(p.filterrank) === undefined ? undefined : num(p.filterrank)! * 10,
  roadKind: (p) => {
    const cls = str(p.class)
    if (!cls || /^(?:ferry|aerialway|major_rail|minor_rail|service_rail|construction|golf|level_crossing|turning_circle|traffic_signals)$/.test(cls))
      return undefined
    return roadClassForHighway(cls === 'path' ? str(p.type) ?? 'path' : cls)
  },
  oneway,
  ramp: p => isLink(p.class),
  level: p => num(p.layer) || (p.structure === 'bridge' ? 1 : p.structure === 'tunnel' ? -1 : 0),
  waterKind: p => str(p.class) ?? 'water',
  // `street_limited` is a street with access limits of some kind: not one to drive through.
  access: p => p.class === 'street_limited' ? { car: false, foot: true, bicycle: true } : EVERYONE,
  service: p => str(p.class) === 'service' ? str(p.type) : undefined,
}

export const TILE_SCHEMAS: readonly TileSchema[] = [OPENMAPTILES, PROTOMAPS, SHORTBREAD, MAPBOX_STREETS]

/**
 * The schema whose layers these are, by the layers only it has. OpenMapTiles
 * when nothing else matches.
 */
export function detectSchema(layerNames: Iterable<string>): TileSchema {
  const names = new Set(layerNames)
  if (names.has('transportation') || names.has('transportation_name'))
    return OPENMAPTILES
  if (names.has('streets') || names.has('place_labels') || names.has('street_labels'))
    return SHORTBREAD
  if (names.has('road') || names.has('poi_label') || names.has('place_label'))
    return MAPBOX_STREETS
  if (names.has('roads') || names.has('places') || names.has('pois'))
    return PROTOMAPS
  return OPENMAPTILES
}

/**
 * OpenMapTiles with some layers renamed: what a style built with
 * `styles.light({ sourceLayers })` reads, for a source that keeps the
 * schema's attributes under other layer names.
 */
export function renamedOpenMapTiles(layers: Partial<Record<'place' | 'poi' | 'waterName' | 'transportation' | 'transportationName' | 'park' | 'mountainPeak' | 'aerodrome', string>>): TileSchema {
  return {
    ...OPENMAPTILES,
    name: 'openmaptiles (renamed)',
    places: [layers.place ?? 'place'],
    pois: [layers.poi ?? 'poi'],
    waters: [layers.waterName ?? 'water_name'],
    parks: [layers.park ?? 'park'],
    peaks: [layers.mountainPeak ?? 'mountain_peak'],
    airports: [layers.aerodrome ?? 'aerodrome_label'],
    streetNames: [layers.transportationName ?? 'transportation_name'],
    roads: [layers.transportation ?? 'transportation'],
  }
}
