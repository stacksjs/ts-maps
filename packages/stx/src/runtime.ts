import type { TsMap } from 'ts-maps'
import { control, divIcon, marker as makeMarker, popup as makePopup, styles, tileLayer } from 'ts-maps'

/**
 * How the components in this package become things on a map.
 *
 * React, Vue, Svelte and Solid each give a child component its own instance
 * and its own lifecycle, so `<Marker>` can create a marker for itself. stx
 * does not work that way: a component's `<script client>` is emitted once per
 * *definition*, not per use. Ten `<Marker>` tags produce ten pieces of markup
 * and exactly one script — so a marker that builds itself in its own script
 * yields one marker no matter how many you write.
 *
 * The grain of the framework is the other way round: children render data,
 * and one script reads it. So every child here is pure server-rendered markup
 * carrying `data-` attributes, and `<Map>` walks its own subtree once on mount
 * and builds what it finds. That also removes the ordering problem entirely —
 * there is only one script, and it runs after the markup exists.
 *
 * Everything below is plain DOM in and map objects out, which is what makes it
 * testable without a framework at all.
 */

/** Attribute a child renders to declare what it is. */
export const CHILD_ATTRIBUTE = 'data-ts-map-child'

interface MapHost extends HTMLElement {
  __tsMap?: TsMap | null
}

/** Publish a map on its container so host code can reach it. */
export function publishMap(container: HTMLElement, map: TsMap): void {
  (container as MapHost).__tsMap = map
  container.setAttribute('data-ts-map', '')
}

export function unpublishMap(container: HTMLElement): void {
  (container as MapHost).__tsMap = null
  container.removeAttribute('data-ts-map')
}

/** The nearest enclosing map, from any element inside it. */
export function findMap(from: Element | null | undefined): TsMap | null {
  return ((from?.closest?.('[data-ts-map]') ?? null) as MapHost | null)?.__tsMap ?? null
}

/**
 * Read a JSON `data-` attribute.
 *
 * Returns the fallback rather than throwing on malformed JSON: one bad marker
 * should not take the whole map down with it.
 */
export function readJson<T>(el: Element, name: string, fallback: T): T {
  const raw = el.getAttribute(name)
  if (raw === null || raw === '')
    return fallback
  try {
    return JSON.parse(raw) as T
  }
  catch {
    console.warn(`[ts-maps] ignoring malformed ${name} on`, el)
    return fallback
  }
}

/**
 * Drop `undefined` values.
 *
 * stx passes every declared prop through, so an option the author never set
 * still arrives — and handing `undefined` to a control or layer overrides its
 * default with nothing.
 */
export function definedOnly(options: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined)
      out[key] = value
  }
  return out
}

/**
 * Turn the props `<Map>` forwarded into the options TsMap wants.
 *
 * Defaults live here rather than in the component because stx materialises a
 * `const` only for props the caller actually passed: a default written in the
 * template evaluates to undefined for anything omitted, and then disappears
 * from the serialised object. In TypeScript it is just a default.
 */
export interface MapProps {
  center?: [number, number]
  zoom?: number
  minZoom?: number
  maxZoom?: number
  bearing?: number
  pitch?: number
  theme?: 'light' | 'dark' | 'auto'
  styleSpec?: unknown
  basemap?: 'dark' | 'light'
  tiles?: string | string[]
  tilesAttribution?: string
  basemapMode?: 'vector' | 'raster'
  zoomControl?: boolean
  attributionControl?: boolean
}

export function mapOptionsFrom(props: MapProps): Record<string, unknown> {
  const style = props.styleSpec ?? buildBasemap(props)

  return definedOnly({
    center: props.center ?? [0, 0],
    zoom: props.zoom ?? 2,
    minZoom: props.minZoom,
    maxZoom: props.maxZoom,
    bearing: props.bearing ?? 0,
    pitch: props.pitch ?? 0,
    theme: props.theme ?? 'light',
    zoomControl: props.zoomControl ?? true,
    attributionControl: props.attributionControl ?? true,
    style,
  })
}

/** One of the bundled basemaps, when `basemap` names one and `tiles` is set. */
function buildBasemap(props: MapProps): unknown {
  if (props.basemap !== 'dark' && props.basemap !== 'light')
    return undefined
  if (!props.tiles || (Array.isArray(props.tiles) && props.tiles.length === 0)) {
    console.warn('[ts-maps] <Map basemap> needs a `tiles` url; ignoring')
    return undefined
  }

  return styles[props.basemap]({
    tiles: props.tiles,
    mode: props.basemapMode ?? 'vector',
    attribution: props.tilesAttribution,
  })
}

type Removable = { remove: () => unknown }

/** Build the popup declared by a `<template data-ts-map-child="popup">`. */
function buildPopup(el: HTMLTemplateElement): { instance: any, open: boolean, lat?: number, lng?: number } {
  const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))

  // The markup between the tags is the content, handed over as an element so
  // it keeps whatever styling and structure the author wrote.
  const holder = document.createElement('div')
  holder.appendChild(el.content ? el.content.cloneNode(true) : document.createDocumentFragment())

  const instance = makePopup(options).setContent(holder)
  const lat = el.hasAttribute('data-lat') ? Number(el.getAttribute('data-lat')) : undefined
  const lng = el.hasAttribute('data-lng') ? Number(el.getAttribute('data-lng')) : undefined

  return { instance, open: el.hasAttribute('data-open'), lat, lng }
}

/**
 * Build every child declared in `root`, and return a teardown for all of them.
 *
 * Children are read once, at mount. A page that adds markers later should do
 * so through the map itself — see `findMap`.
 */
export function mountChildren(map: TsMap, root: HTMLElement): () => void {
  const created: Removable[] = []
  const anyMap = map as any

  const ensureStyle = (): void => {
    // A source or layer needs a style to live in; starting an empty one means
    // <Source> and <Layer> work without <Map> being handed a styleSpec first.
    if (!anyMap.getStyle?.())
      anyMap.setStyle({ version: 8, sources: {}, layers: [] })
  }

  for (const el of Array.from(root.querySelectorAll(`[${CHILD_ATTRIBUTE}]`))) {
    const kind = el.getAttribute(CHILD_ATTRIBUTE)

    try {
      switch (kind) {
        case 'tile-layer': {
          const url = el.getAttribute('data-url') ?? ''
          const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          created.push(tileLayer(url, options).addTo(map) as Removable)
          break
        }

        case 'control': {
          const type = el.getAttribute('data-type') ?? ''
          const factory = (control as unknown as Record<string, (o?: unknown) => any>)[type]
          if (typeof factory !== 'function') {
            console.warn(`[ts-maps] unknown control type: ${type}`)
            break
          }
          const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          created.push(factory(options).addTo(map) as Removable)
          break
        }

        case 'marker': {
          const lat = Number(el.getAttribute('data-lat') ?? 0)
          const lng = Number(el.getAttribute('data-lng') ?? 0)
          const options = definedOnly(readJson<Record<string, unknown>>(el, 'data-options', {}))
          const icon = definedOnly(readJson<Record<string, unknown>>(el, 'data-icon', {}))

          if (icon.html !== undefined)
            options.icon = divIcon(icon)

          const instance = makeMarker([lat, lng], options).addTo(map)
          created.push(instance as Removable)

          // A popup written inside the marker binds to it and opens on click.
          const nested = el.querySelector('template[data-ts-map-child="popup"]') as HTMLTemplateElement | null
          if (nested) {
            const { instance: popupInstance, open } = buildPopup(nested)
            const bindable = instance as any
            bindable.bindPopup(popupInstance)
            if (open)
              bindable.openPopup()
          }

          // A DOM event rather than a callback prop: stx passes props as data,
          // so a function cannot cross the component boundary. It bubbles, so
          // one listener on the map container can serve every marker.
          const eventName = el.getAttribute('data-click-event') || 'marker:click'
          const emitter = instance as any
          emitter.on('click', (event: any) => {
            el.dispatchEvent(new CustomEvent(eventName, {
              bubbles: true,
              detail: { marker: instance, latlng: event?.latlng, originalEvent: event },
            }))
          })
          break
        }

        case 'popup': {
          // Only free-standing popups are built here; one inside a marker was
          // already bound above.
          if (el.closest(`[${CHILD_ATTRIBUTE}="marker"]`))
            break
          const { instance, open, lat, lng } = buildPopup(el as HTMLTemplateElement)
          if (lat !== undefined && lng !== undefined) {
            instance.setLatLng([lat, lng])
            if (open)
              instance.openOn(map)
          }
          created.push({ remove: () => anyMap.closePopup(instance) })
          break
        }

        case 'source': {
          ensureStyle()
          const id = el.getAttribute('data-id') ?? ''
          const spec = definedOnly(readJson<Record<string, unknown>>(el, 'data-spec', {}))
          anyMap.addSource(id, spec)
          created.push({ remove: () => anyMap.removeSource(id) })
          break
        }

        case 'layer': {
          ensureStyle()
          const spec = definedOnly(readJson<Record<string, unknown>>(el, 'data-spec', {}))
          const before = el.getAttribute('data-before') ?? undefined
          anyMap.addStyleLayer(spec, before)
          created.push({ remove: () => anyMap.removeStyleLayer(spec.id) })
          break
        }

        default:
          console.warn(`[ts-maps] unknown map child: ${kind}`)
      }
    }
    catch (error) {
      // One malformed child should not stop the rest of the map from building.
      console.warn(`[ts-maps] failed to build ${kind}`, error)
    }
  }

  return () => {
    // Reverse order: layers come off before the sources they read from.
    for (const item of created.reverse()) {
      try {
        item.remove()
      }
      catch {
        // Already gone with the map.
      }
    }
    created.length = 0
  }
}

// eslint-disable-next-line no-unused-vars
export type MapEventHandler = (e: any) => void

/**
 * Subscribe to a map event for as long as the caller lives.
 *
 * The equivalent of `useMapEvent` in the other bindings, spelled for a
 * framework where a component holds a DOM element rather than a context value.
 */
export function onMapEvent(
  from: Element | null | undefined,
  event: string,
  handler: MapEventHandler,
): () => void {
  const map = findMap(from)
  if (!map)
    return () => {}

  map.on(event, handler)
  return () => map.off(event, handler)
}
