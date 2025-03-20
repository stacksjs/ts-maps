import type { MapInterface, MarkerConfig, MarkerInstance } from '../types'
import Marker from '../components/marker'
import { merge } from '../util'

export default function createMarkers(
  this: MapInterface,
  markers: Record<string, MarkerConfig> = {},
  isRecentlyCreated = false,
): void {
  for (let index in markers) {
    const config = markers[index]
    const point = this.getMarkerPosition(config)
    const uid = config.coords.join(':')

    if (!point) {
      continue
    }

    // We're checking if recently created marker does already exist
    // If it does we don't need to create it again, so we'll continue
    // Because we may have more than one marker submitted via `addMarkers` method.
    if (isRecentlyCreated) {
      if (
        Object.keys(this._markers || {}).filter(i => this._markers?.[i]._uid === uid).length
      ) {
        continue
      }

      index = String(Object.keys(this._markers || {}).length)
    }

    const marker = new Marker(
      {
        index,
        map: this,
        label: this.params.labels?.markers ? {} : undefined,
        labelsGroup: this._markerLabelsGroup,
        cx: point.x,
        cy: point.y,
        group: this._markersGroup,
        config,
        isRecentlyCreated,
      },
      merge(this.params.markerStyle || {}, { ...(config.style || {}) }, true),
    )

    // Check for marker duplication
    // this is useful when for example: a user clicks a button for creating marker two times
    // so it will remove the old one and the new one will take its place.
    if (this._markers?.[index]) {
      this.removeMarkers([index])
    }

    this._markers[index] = {
      _uid: uid,
      config,
      element: marker as unknown as MarkerInstance,
    }
  }
}
