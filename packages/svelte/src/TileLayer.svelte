<script lang="ts">
  import type { TileLayer as TileLayerClass } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { tileLayer } from 'ts-maps'
  import { useMap } from './useMap'

  /** A `{z}/{x}/{y}` URL. Followed. */
  export let url: string
  /** Anything the core `TileLayer` takes. Read once, as are the props below. */
  export let options: Record<string, unknown> | undefined = undefined
  export let attribution: string | undefined = undefined
  export let subdomains: string | string[] | undefined = undefined
  export let tileSize: number | undefined = undefined
  export let minZoom: number | undefined = undefined
  export let maxZoom: number | undefined = undefined

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const map = useMap()
  let layer: TileLayerClass | null = null
  let shown = url

  onMount(() => {
    if (!map) return
    const opts: Record<string, unknown> = { ...options }
    if (attribution !== undefined) opts.attribution = attribution
    if (subdomains !== undefined) opts.subdomains = subdomains
    if (tileSize !== undefined) opts.tileSize = tileSize
    if (minZoom !== undefined) opts.minZoom = minZoom
    if (maxZoom !== undefined) opts.maxZoom = maxZoom
    shown = url
    layer = tileLayer(url, opts).addTo(map) as TileLayerClass
  })

  function follow(l: TileLayerClass, to: string): void {
    if (to === shown) return
    shown = to
    l.setUrl(to)
  }

  $: if (layer) follow(layer, url)

  onDestroy(() => {
    layer?.remove?.()
    layer = null
  })
</script>
