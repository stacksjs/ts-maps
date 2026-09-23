// Hand-off links: open a destination in the navigation app the person already
// uses, rather than re-implementing turn-by-turn inside the map.
//
// These are plain https URLs on purpose. On iOS `maps.apple.com` opens Apple
// Maps and `www.google.com/maps` opens the Google Maps app when it is
// installed (Safari otherwise); on Android both resolve through the system's
// link handling. A custom scheme (`maps://`, `comgooglemaps://`) fails
// outright when the app is missing, and a webview host has to allow-list it
// before it will even try — an https link degrades to the web instead.
//
// Apple:  https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
// Google: https://developers.google.com/maps/documentation/urls/get-started#directions-action

import type { LatLngLike } from './types'

/** How the person will travel to the destination. */
export type NavigationMode = 'driving' | 'walking' | 'cycling' | 'transit'

export interface NavigationLinkOptions {
  /** Defaults to driving: the trip to a trailhead is almost always by car. */
  mode?: NavigationMode
  /** Start point. Omitted, both apps start from the device's location. */
  origin?: LatLngLike
}

export interface NavigationLinks {
  apple: string
  google: string
}

const APPLE_DIRFLG: Record<NavigationMode, string | undefined> = {
  driving: 'd',
  walking: 'w',
  transit: 'r',
  // The Apple Maps link format has no cycling flag. Leaving it off lets Maps
  // use the person's own default instead of quietly routing them by car.
  cycling: undefined,
}

const GOOGLE_TRAVELMODE: Record<NavigationMode, string> = {
  driving: 'driving',
  walking: 'walking',
  cycling: 'bicycling',
  transit: 'transit',
}

/**
 * `lat,lng` at six decimals (~11 cm), which is well past GPS precision and
 * keeps the URL short. Throws on a coordinate no map could navigate to, so a
 * missing trailhead fails here rather than opening the ocean at 0,0.
 */
export function formatCoordinate(point: LatLngLike): string {
  const { lat, lng } = point
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw new RangeError(`Not a navigable coordinate: ${lat},${lng}`)
  return `${round6(lat)},${round6(lng)}`
}

function round6(value: number): string {
  // Number() drops trailing zeros; `+0` keeps -0 from printing as "-0".
  return String(Number(value.toFixed(6)) + 0)
}

/** Directions in Apple Maps. */
export function appleMapsDirectionsUrl(destination: LatLngLike, opts: NavigationLinkOptions = {}): string {
  const params = new URLSearchParams()
  if (opts.origin)
    params.set('saddr', formatCoordinate(opts.origin))
  params.set('daddr', formatCoordinate(destination))
  const flag = APPLE_DIRFLG[opts.mode ?? 'driving']
  if (flag)
    params.set('dirflg', flag)
  return `https://maps.apple.com/?${params.toString()}`
}

/** Directions in Google Maps (the app when installed, the web otherwise). */
export function googleMapsDirectionsUrl(destination: LatLngLike, opts: NavigationLinkOptions = {}): string {
  const params = new URLSearchParams()
  params.set('api', '1')
  if (opts.origin)
    params.set('origin', formatCoordinate(opts.origin))
  params.set('destination', formatCoordinate(destination))
  params.set('travelmode', GOOGLE_TRAVELMODE[opts.mode ?? 'driving'])
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Both hand-off links for one destination. */
export function directionsLinks(destination: LatLngLike, opts: NavigationLinkOptions = {}): NavigationLinks {
  return {
    apple: appleMapsDirectionsUrl(destination, opts),
    google: googleMapsDirectionsUrl(destination, opts),
  }
}
