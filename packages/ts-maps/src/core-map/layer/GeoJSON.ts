import * as Util from '../core/Util'
import * as LineUtil from '../geometry/LineUtil'
import { LatLng } from '../geo/LatLng'
import { FeatureGroup } from './FeatureGroup'
import { LayerGroup } from './LayerGroup'
import { Marker } from './marker/Marker'
import { Circle } from './vector/Circle'
import { CircleMarker } from './vector/CircleMarker'
import { Polygon } from './vector/Polygon'
import { Polyline } from './vector/Polyline'

export class GeoJSON extends FeatureGroup {
  initialize(geojson?: any, options?: any): void {
    super.initialize(undefined, options)
    if (geojson)
    this.addData(geojson)
  }

  addData(geojson: any): this {
    const features = Array.isArray(geojson) ? geojson : geojson.features

    if (features) {
      for (const feature of features) {
        if (feature.geometries || feature.geometry || feature.features || feature.coordinates)
        this.addData(feature)
      }
      return this
    }

    const options = this.options!
    if (options.filter && !options.filter(geojson))
    return this

    const layer: any = GeoJSON.geometryToLayer(geojson, options)
    if (!layer)
    return this
    layer.feature = GeoJSON.asFeature(geojson)
    layer.defaultOptions = layer.options
    this.resetStyle(layer)

    if (options.onEachFeature)
    options.onEachFeature(geojson, layer)

    return this.addLayer(layer)
  }

  resetStyle(layer?: any): this {
    if (layer === undefined)
    return this.eachLayer(this.resetStyle, this)
    layer.options = Object.create(layer.defaultOptions)
    this._setLayerStyle(layer, this.options!.style)
    return this
  }

  setStyle(style: any): this {
    return this.eachLayer(l => this._setLayerStyle(l, style))
  }

  _setLayerStyle(layer: any, style: any): void {
    if (layer.setStyle) {
      if (typeof style === 'function')
      style = style(layer.feature)
      layer.setStyle(style)
    }
  }

  static geometryToLayer(geojson: any, options?: any): any {
    const geometry = geojson.type === 'Feature' ? geojson.geometry : geojson
    const coords = geometry?.coordinates
    const layers: any[] = []
    const pointToLayer = options?.pointToLayer
    const _coordsToLatLng = options?.coordsToLatLng ?? GeoJSON.coordsToLatLng
    let latlng: LatLng, latlngs: any

    if (!coords && !geometry)
    return null

    switch (geometry.type) {
      case 'Point':
      latlng = _coordsToLatLng(coords)
      return GeoJSON._pointToLayer(pointToLayer, geojson, latlng, options)
      case 'MultiPoint':
      for (const coord of coords) {
        latlng = _coordsToLatLng(coord)
        layers.push(GeoJSON._pointToLayer(pointToLayer, geojson, latlng, options))
      }
      return new FeatureGroup(layers)
      case 'LineString':
      case 'MultiLineString':
      latlngs = GeoJSON.coordsToLatLngs(coords, geometry.type === 'LineString' ? 0 : 1, _coordsToLatLng)
      return new Polyline(latlngs, options)
      case 'Polygon':
      case 'MultiPolygon':
      latlngs = GeoJSON.coordsToLatLngs(coords, geometry.type === 'Polygon' ? 1 : 2, _coordsToLatLng)
      return new Polygon(latlngs, options)
      case 'GeometryCollection':
      for (const g of geometry.geometries) {
        const geoLayer = GeoJSON.geometryToLayer( {
          geometry: g,
          type: 'Feature',
          properties: geojson.properties,
        }, options)
        if (geoLayer)
        layers.push(geoLayer)
      }
      return new FeatureGroup(layers)
      case 'FeatureCollection':
      for (const f of geometry.features) {
        const featureLayer = GeoJSON.geometryToLayer(f, options)
        if (featureLayer)
        layers.push(featureLayer)
      }
      return new FeatureGroup(layers)
      default:
      throw new Error('Invalid GeoJSON object.')
    }
  }

  static _pointToLayer(pointToLayerFn: any, geojson: any, latlng: LatLng, options?: any): any {
    return pointToLayerFn ? pointToLayerFn(geojson, latlng) : new Marker(latlng, options?.markersInheritOptions && options)
  }

  static coordsToLatLng(coords: number[]): LatLng {
    return new LatLng(coords[1], coords[0], coords[2])
  }

  static coordsToLatLngs(coords: any[], levelsDeep?: number, _coordsToLatLng?: (c: number[]) => LatLng): any[] {
    return coords.map((coord: any) => (levelsDeep
    ? GeoJSON.coordsToLatLngs(coord, levelsDeep - 1, _coordsToLatLng)
    : (_coordsToLatLng || GeoJSON.coordsToLatLng)(coord)))
  }

  static latLngToCoords(latlng: any, precision?: number | false): number[] {
    const ll = new LatLng(latlng)
    return ll.alt !== undefined
    ? [Util.formatNum(ll.lng, precision), Util.formatNum(ll.lat, precision), Util.formatNum(ll.alt, precision)]
    : [Util.formatNum(ll.lng, precision), Util.formatNum(ll.lat, precision)]
  }

  static latLngsToCoords(latlngs: any[], levelsDeep?: number, close?: boolean, precision?: number | false): any[] {
    const coords = latlngs.map((latlng: any) => (levelsDeep
    ? GeoJSON.latLngsToCoords(latlng, LineUtil.isFlat(latlng) ? 0 : levelsDeep - 1, close, precision)
    : GeoJSON.latLngToCoords(latlng, precision)))

    if (!levelsDeep && close && coords.length > 0)
    coords.push((coords[0] as number[]).slice())

    return coords
  }

  static getFeature(layer: any, newGeometry: any): any {
    return layer.feature ? { ...layer.feature, geometry: newGeometry } : GeoJSON.asFeature(newGeometry)
  }

  static asFeature(geojson: any): any {
    if (geojson.type === 'Feature' || geojson.type === 'FeatureCollection')
    return geojson
    return { type: 'Feature', properties: {}, geometry: geojson }
  }
}

const PointToGeoJSON = {
  toGeoJSON(this: any, precision?: number | false): any {
    return GeoJSON.getFeature(this, {
      type: 'Point',
      coordinates: GeoJSON.latLngToCoords(this.getLatLng(), precision),
    })
  },
}

Marker.include(PointToGeoJSON)
Circle.include(PointToGeoJSON)
CircleMarker.include(PointToGeoJSON)

Polyline.include( {
  toGeoJSON(this: any, precision?: number | false): any {
    const multi = !LineUtil.isFlat(this._latlngs)
    const coords = GeoJSON.latLngsToCoords(this._latlngs, multi ? 1 : 0, false, precision)
    return GeoJSON.getFeature(this, {
      type: `${multi ? 'Multi' : ''}LineString`,
      coordinates: coords,
    })
  },
})

Polygon.include( {
  toGeoJSON(this: any, precision?: number | false): any {
    const holes = !LineUtil.isFlat(this._latlngs)
    const multi = holes && !LineUtil.isFlat(this._latlngs[0])
    let coords = GeoJSON.latLngsToCoords(this._latlngs, multi ? 2 : holes ? 1 : 0, true, precision)
    if (!holes)
    coords = [coords]
    return GeoJSON.getFeature(this, {
      type: `${multi ? 'Multi' : ''}Polygon`,
      coordinates: coords,
    })
  },
})

LayerGroup.include( {
  toMultiPoint(this: any, precision?: number | false): any {
    const coords: any[] = []
    this.eachLayer((layer: any) => {
      coords.push(layer.toGeoJSON(precision).geometry.coordinates)
    })
    return GeoJSON.getFeature(this, { type: 'MultiPoint', coordinates: coords })
  },

  toGeoJSON(this: any, precision?: number | false): any {
    const type = this.feature?.geometry?.type
    if (type === 'MultiPoint')
    return this.toMultiPoint(precision)

    const isGeometryCollection = type === 'GeometryCollection'
    const jsons: any[] = []

    this.eachLayer((layer: any) => {
      if (layer.toGeoJSON) {
        const json = layer.toGeoJSON(precision)
        if (isGeometryCollection) {
          jsons.push(json.geometry)
        }
        else {
          const feature = GeoJSON.asFeature(json)
          if (feature.type === 'FeatureCollection')
          jsons.push(...feature.features)
          else
          jsons.push(feature)
        }
      }
    })

    if (isGeometryCollection)
    return GeoJSON.getFeature(this, { geometries: jsons, type: 'GeometryCollection' })

    return { type: 'FeatureCollection', features: jsons }
  },
})
