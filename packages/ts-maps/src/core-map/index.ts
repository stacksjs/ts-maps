/**
* ts - maps — a modern TypeScript interactive map library.
*
* Portions of this codebase were derived from the open - source Leaflet
* project (BSD - 2-Clause, © Vladimir Agafonkin and contributors). The
* module layout and public API shape follow its design. See CREDITS.md
* for details; all identifiers and classnames here are part of ts - maps.
*/

export const version: string = '0.3.0'

export * from './control/index'
export * from './core/index'
export * from './dom/index'
export * from './geometry/index'
export * from './geo/index'
export * from './layer/index'
export * from './map/index'

// Shorthand factory helpers (similar to upstream's function-style API).
import { AttributionControl, Control, LayersControl, ScaleControl, ZoomControl } from './control/index'
import { Browser, Class, Evented, Handler, Util } from './core/index'
import { Draggable, PosAnimation } from './dom/index'
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
  VideoOverlay,
  WMSTileLayer,
} from './layer/index'
import { createMap, TsMap } from './map/index'

// Factory helper: turns a constructor into a callable function.
type Factory < A extends any[], T> = (...args: A) => T
function factory < A extends any[], T > (Ctor: new (...args: A) => T): Factory < A, T> {
  return (...args: A): T => new Ctor(...args)
}

export const map: Factory < ConstructorParameters < typeof TsMap>, TsMap> = createMap
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
} = Object.assign(factory(Control), {
  zoom: factory(ZoomControl),
  layers: factory(LayersControl),
  attribution: factory(AttributionControl),
  scale: factory(ScaleControl),
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
  Draggable,
  PosAnimation,
  // map
  Map: TsMap,
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
  WMSTileLayer,
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
}

// In browser environments, expose as `window.tsMap` for convenient global access.
if (typeof window !== 'undefined')
(window as any).tsMap ??= tsMap

export default tsMap
