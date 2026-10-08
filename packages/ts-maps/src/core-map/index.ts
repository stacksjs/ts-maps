/**
* ts - maps — a modern TypeScript interactive map library.
*
* Portions of this codebase were derived from the open - source Leaflet
* project (BSD - 2-Clause, © Vladimir Agafonkin and contributors). The
* module layout and public API shape follow its design. See CREDITS.md
* for details; all identifiers and classnames here are part of ts - maps.
*/

export const version: string = '0.4.0'

export * from './control/index'
export * from './core/index'
export * from './dom/index'
export * from './geometry/index'
export * from './game/index'
export * from './geo/index'
export * from './layer/index'
export * from './map/index'
export * from './storage/index'
export * from './offline/index'
export { label as imdfLabel, loadIMDF, searchIndoor, unzip } from './indoor/imdf'
export type { IMDFFeature, IMDFSource, IndoorLevel, IndoorPlace, IndoorVenue, LoadIMDFOptions } from './indoor/imdf'
export { INDOOR_EVENTS, IndoorMap, indoorMap } from './indoor/IndoorMap'
export type { IndoorEvent, IndoorMapOptions } from './indoor/IndoorMap'
export { LOOK_AROUND_EVENTS, LookAround, lookAround } from './lookaround/LookAround'
export type { LookAroundEvent, LookAroundOptions, LookAroundTarget } from './lookaround/LookAround'
export { bearingBetween, headingToward, panoramaU, stepsFrom, stepToward } from './lookaround/navigation'
export { MapillaryImagery, metresBetween, nearestImage, PanoramaxImagery } from './lookaround/providers'
export type { MapillaryOptions, PanoramaxOptions, StreetImage, StreetImageryCoverage, StreetImageryProvider } from './lookaround/providers'
export { loadModel, modelFromGltf, parseGLB } from './landmarks/gltf'
export type { GltfJson, LandmarkModel, LoadModelOptions, ModelSource } from './landmarks/gltf'
export { Landmark, landmark } from './landmarks/Landmark'
export type { LandmarkOptions } from './landmarks/Landmark'
export { plantTrees, treeKind, Trees, trees } from './landmarks/trees'
export type { TreesOptions } from './landmarks/trees'
export { roofOf } from './renderer/webgl/roofs'
export type { Roof, RoofShape } from './renderer/webgl/roofs'
export { CONGESTION_COLORS, TomTomIncidents, TrafficLayer, trafficLayer, trafficSources } from './traffic/TrafficLayer'
export type { Congestion, IncidentProvider, TomTomIncidentsOptions, TrafficIncident, TrafficLayerOptions, TrafficSourceSpec } from './traffic/TrafficLayer'
export * from './search/index'
export { addMessages, formatDate, formatNumber, hasMessage, message, messageLocales, resolveLocale, translator } from './i18n'
export type { Catalogue, Message, Translate } from './i18n'
// Decode a vector tile by hand — `new VectorTile(new Pbf(bytes))` — e.g. to
// check an archive read with `ts-maps/pmtiles` before publishing it.
export {
  GEOM_TYPE_NAMES,
  MVT_GEOM_LINESTRING,
  MVT_GEOM_POINT,
  MVT_GEOM_POLYGON,
  MVT_GEOM_UNKNOWN,
  VectorTile,
  VectorTileFeature,
  VectorTileLayer,
} from './mvt'
export type {
  GeoJSONFeature,
  GeoJSONGeometry,
  GeoJSONLineString,
  GeoJSONMultiLineString,
  GeoJSONMultiPoint,
  GeoJSONMultiPolygon,
  GeoJSONPoint,
  GeoJSONPolygon,
  GeomType,
  VectorTileProperties,
  VectorTileValue,
} from './mvt'
export { Pbf } from './proto'
// `pmtiles://` sources: a PMTiles archive on a bucket or CDN, read in place.
// The reader and writer themselves are in `ts-maps/pmtiles`.
export {
  clearPMTilesArchives,
  getPMTilesArchive,
  isPMTilesUrl,
  parsePMTilesTileUrl,
  PMTILES_PROTOCOL,
  pmtilesArchiveUrl,
  pmtilesFetch,
  pmtilesSourceUrl,
  pmtilesTileJSON,
  pmtilesTileUrl,
  readPMTilesTile,
  setPMTilesArchive,
  withPMTiles,
} from './pmtiles/protocol'
export type { PMTilesArchiveOptions, PMTilesFetch, PMTilesTileJSON } from './pmtiles/protocol'
export { earcut, flatten, deviation } from './geometry/earcut'
export { WebGLTileRenderer, WebGLUnsupportedError } from './renderer/webgl/index'
export type { CircleOptions as WebGLCircleOptions, GLContextOptions, LineOptions as WebGLLineOptions, Mat4 } from './renderer/webgl/index'

// Shorthand factory helpers (similar to upstream's function-style API).
import { AttributionControl, Control, FullscreenControl, GeocoderControl, LayersControl, LocateControl, MapTypeControl, NavigationControl, OfflineMapsControl, ScaleControl, SearchControl, ZoomControl } from './control/index'
import { LookAround as LookAroundControl } from './lookaround/LookAround'
import { Browser, Class, Evented, Handler, Util } from './core/index'
import { Animation, Draggable, PosAnimation } from './dom/index'
import { CRS, EPSG3395, EPSG3857, EPSG4326, LatLng, LatLngBounds, Projection, SimpleCRS, toLatLng, toLatLngBounds } from './geo/index'
import { Bounds, LineUtil, Point, PolyUtil, toBounds, toPoint, Transformation, toTransformation } from './geometry/index'
import {
  Circle,
  CircleMarker,
  DefaultIcon,
  DivIcon,
  FeatureGroup,
  GeoJSON,
  GridLayer,
  HeatmapLayer,
  RasterDEMLayer,
  RouteEditor,
  RunTrailLayer,
  TerritoryLayer,
  Icon,
  ImageOverlay,
  Layer,
  LayerGroup,
  Marker,
  Polygon,
  Polyline,
  Popup,
  Rectangle,
  SVGOverlay,
  TileLayer,
  Tooltip,
  VectorTileMapLayer,
  VideoOverlay,
  WMSTileLayer,
} from './layer/index'
import { routeEditor, runTrailLayer, territoryLayer } from './layer/index'
import { createMap, Map, TsMap } from './map/index'
import * as services from './services/index'
import * as styles from './styles/index'

export { services, styles }
export { resolveStyleSources, resolveTileJSON, tileJSONSources } from './styles/tilejson'
export type { ResolvedTileJSON, ResolveTileJSONOptions } from './styles/tilejson'
// The static renderer rides in the main entry too, so an app that loads
// ts-maps as one browser chunk can draw a share card's map with what it has.
export { mercatorX, mercatorY, renderStaticMap, staticMapSvg, staticMapView, staticMapZoom } from './static/index'
export type { StaticMap, StaticMapOptions, StaticMapView } from './static/index'
export { formatDuration, lineBadge, trafficNote, transitSummary, TURN_BY_TURN_EVENTS, TurnByTurn, turnByTurn, voiceFor } from './navigation/TurnByTurn'
export type { LatLngInput, TurnByTurnEvent, TurnByTurnOptions, TurnByTurnTarget } from './navigation/TurnByTurn'

// Factory helper: turns a constructor into a callable function.
type Factory<A extends any[], T> = (..._args: A) => T
function factory<A extends any[], T>(Ctor: new (...args: A) => T): Factory<A, T> {
  return (...args: A): T => new Ctor(...args)
}

export const map: Factory < ConstructorParameters < typeof Map>, Map> = createMap
export const marker: Factory < ConstructorParameters < typeof Marker>, Marker> = factory(Marker)
export const icon: Factory < ConstructorParameters < typeof Icon>, Icon> = factory(Icon)
export const divIcon: Factory < ConstructorParameters < typeof DivIcon>, DivIcon> = factory(DivIcon)
export const layerGroup: Factory < ConstructorParameters < typeof LayerGroup>, LayerGroup> = factory(LayerGroup)
export const featureGroup: Factory < ConstructorParameters < typeof FeatureGroup>, FeatureGroup> = factory(FeatureGroup)
export const geoJSON: Factory < ConstructorParameters < typeof GeoJSON>, GeoJSON> = factory(GeoJSON)
export const geoJson: typeof geoJSON = geoJSON
export const gridLayer: Factory < ConstructorParameters < typeof GridLayer>, GridLayer> = factory(GridLayer)
export const tileLayer: Factory < ConstructorParameters < typeof TileLayer>, TileLayer> & { wms: Factory < ConstructorParameters < typeof WMSTileLayer>, WMSTileLayer> } = Object.assign(
factory(TileLayer),
{ wms: factory(WMSTileLayer) },
)
export const vectorTileLayer: Factory < ConstructorParameters < typeof VectorTileMapLayer>, VectorTileMapLayer> = factory(VectorTileMapLayer)
export const heatmapLayer: Factory < ConstructorParameters < typeof HeatmapLayer>, HeatmapLayer> = factory(HeatmapLayer)
export const rasterDEMLayer: Factory < ConstructorParameters < typeof RasterDEMLayer>, RasterDEMLayer> = factory(RasterDEMLayer)
export const imageOverlay: Factory < ConstructorParameters < typeof ImageOverlay>, ImageOverlay> = factory(ImageOverlay)
export const videoOverlay: Factory < ConstructorParameters < typeof VideoOverlay>, VideoOverlay> = factory(VideoOverlay)
export const svgOverlay: Factory < ConstructorParameters < typeof SVGOverlay>, SVGOverlay> = factory(SVGOverlay)
export const popup: Factory < ConstructorParameters < typeof Popup>, Popup> = factory(Popup)
export const tooltip: Factory < ConstructorParameters < typeof Tooltip>, Tooltip> = factory(Tooltip)
export const polyline: Factory < ConstructorParameters < typeof Polyline>, Polyline> = factory(Polyline)
export const polygon: Factory < ConstructorParameters < typeof Polygon>, Polygon> = factory(Polygon)
export const rectangle: Factory < ConstructorParameters < typeof Rectangle>, Rectangle> = factory(Rectangle)
export const circle: Factory < ConstructorParameters < typeof Circle>, Circle> = factory(Circle)
export const circleMarker: Factory < ConstructorParameters < typeof CircleMarker>, CircleMarker> = factory(CircleMarker)
export const control: Factory < ConstructorParameters < typeof Control>, Control> & {
  zoom: Factory < ConstructorParameters < typeof ZoomControl>, ZoomControl>
  layers: Factory < ConstructorParameters < typeof LayersControl>, LayersControl>
  attribution: Factory < ConstructorParameters < typeof AttributionControl>, AttributionControl>
  scale: Factory < ConstructorParameters < typeof ScaleControl>, ScaleControl>
  locate: Factory < ConstructorParameters < typeof LocateControl>, LocateControl>
  geocoder: Factory < ConstructorParameters < typeof GeocoderControl>, GeocoderControl>
  navigation: Factory < ConstructorParameters < typeof NavigationControl>, NavigationControl>
  fullscreen: Factory < ConstructorParameters < typeof FullscreenControl>, FullscreenControl>
  offlineMaps: Factory < ConstructorParameters < typeof OfflineMapsControl>, OfflineMapsControl>
  search: Factory < ConstructorParameters < typeof SearchControl>, SearchControl>
  mapType: Factory < ConstructorParameters < typeof MapTypeControl>, MapTypeControl>
  lookAround: Factory < ConstructorParameters < typeof LookAroundControl>, LookAroundControl>
} = Object.assign(factory(Control), {
  zoom: factory(ZoomControl),
  layers: factory(LayersControl),
  attribution: factory(AttributionControl),
  scale: factory(ScaleControl),
  locate: factory(LocateControl),
  geocoder: factory(GeocoderControl),
  navigation: factory(NavigationControl),
  fullscreen: factory(FullscreenControl),
  offlineMaps: factory(OfflineMapsControl),
  search: factory(SearchControl),
  mapType: factory(MapTypeControl),
  lookAround: factory(LookAroundControl),
})

// Default namespace object grouping all public exports.
const tsMap: Record<string, unknown> = {
  version,
  // core
  Class,
  Evented,
  Handler,
  Util,
  Browser,
  // geometry
  Bounds,
  Point,
  Transformation,
  LineUtil,
  PolyUtil,
  toBounds,
  toPoint,
  toTransformation,
  // geo
  CRS,
  EPSG3395,
  EPSG3857,
  EPSG4326,
  SimpleCRS,
  LatLng,
  LatLngBounds,
  Projection,
  toLatLng,
  toLatLngBounds,
  // dom
  Animation,
  Draggable,
  PosAnimation,
  // map
  Map,
  TsMap,
  // layer
  Layer,
  LayerGroup,
  FeatureGroup,
  GeoJSON,
  ImageOverlay,
  VideoOverlay,
  SVGOverlay,
  Popup,
  Tooltip,
  Icon,
  DefaultIcon,
  DivIcon,
  Marker,
  GridLayer,
  TileLayer,
  VectorTileMapLayer,
  WMSTileLayer,
  TerritoryLayer,
  RunTrailLayer,
  RouteEditor,
  Polyline,
  Polygon,
  Rectangle,
  Circle,
  CircleMarker,
  // control
  Control,
  ZoomControl,
  AttributionControl,
  ScaleControl,
  LayersControl,
  LocateControl,
  GeocoderControl,
  NavigationControl,
  FullscreenControl,
  // factories
  map: createMap,
  marker,
  icon,
  divIcon,
  layerGroup,
  featureGroup,
  geoJSON,
  geoJson,
  gridLayer,
  tileLayer,
  vectorTileLayer,
  heatmapLayer,
  territoryLayer,
  runTrailLayer,
  routeEditor,
  imageOverlay,
  videoOverlay,
  svgOverlay,
  popup,
  tooltip,
  polyline,
  polygon,
  rectangle,
  circle,
  circleMarker,
  control,
  // services
  services,
  // styles
  styles,
}

// In browser environments, expose as `window.tsMap` for convenient global access.
if (typeof window !== 'undefined')
(window as any).tsMap ??= tsMap

export default tsMap
