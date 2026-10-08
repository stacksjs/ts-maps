import type { JSX } from 'solid-js'
import type { TileLayer as TileLayerClass } from 'ts-maps'
import { createEffect, onCleanup, onMount } from 'solid-js'
import { tileLayer } from 'ts-maps'
import { useMap } from './context'

export interface TileLayerProps {
  /** A `{z}/{x}/{y}` URL. Followed. */
  url: string
  /** Anything the core `TileLayer` takes. Read once, as are the props below. */
  options?: Record<string, unknown>
  attribution?: string
  subdomains?: string | string[]
  tileSize?: number
  minZoom?: number
  maxZoom?: number
}

export function TileLayer(props: TileLayerProps): JSX.Element {
  // Read in the body: the context is not there in onCleanup.
  const map = useMap()
  let layer: TileLayerClass | null = null
  let shown: string | undefined

  onMount(() => {
    if (!map)
      return
    const opts: Record<string, unknown> = { ...props.options }
    if (props.attribution !== undefined) opts.attribution = props.attribution
    if (props.subdomains !== undefined) opts.subdomains = props.subdomains
    if (props.tileSize !== undefined) opts.tileSize = props.tileSize
    if (props.minZoom !== undefined) opts.minZoom = props.minZoom
    if (props.maxZoom !== undefined) opts.maxZoom = props.maxZoom
    shown = props.url
    layer = tileLayer(props.url, opts).addTo(map) as TileLayerClass
  })

  createEffect(() => {
    const url = props.url
    if (!layer || url === shown)
      return
    shown = url
    layer.setUrl(url)
  })

  onCleanup(() => {
    layer?.remove?.()
    layer = null
  })

  return null
}
