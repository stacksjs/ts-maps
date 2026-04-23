import type { JSX } from 'solid-js'
import type { TileLayer as TileLayerClass } from 'ts-maps'
import { onCleanup, onMount } from 'solid-js'
import { tileLayer } from 'ts-maps'
import { useMap } from './context'

export interface TileLayerProps {
  url: string
  attribution?: string
  subdomains?: string | string[]
  tileSize?: number
  minZoom?: number
  maxZoom?: number
}

export function TileLayer(props: TileLayerProps): JSX.Element {
  let layer: TileLayerClass | null = null

  onMount(() => {
    const map = useMap()
    if (!map)
      return
    const opts: Record<string, unknown> = {}
    if (props.attribution !== undefined) opts.attribution = props.attribution
    if (props.subdomains !== undefined) opts.subdomains = props.subdomains
    if (props.tileSize !== undefined) opts.tileSize = props.tileSize
    if (props.minZoom !== undefined) opts.minZoom = props.minZoom
    if (props.maxZoom !== undefined) opts.maxZoom = props.maxZoom
    layer = tileLayer(props.url, opts).addTo(map) as TileLayerClass
  })

  onCleanup(() => {
    layer?.remove?.()
    layer = null
  })

  return null
}
