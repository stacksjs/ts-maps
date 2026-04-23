<script lang="ts">
  import type { TileLayer as TileLayerClass } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { tileLayer } from 'ts-maps'
  import { useMap } from './useMap'

  export let url: string
  export let attribution: string | undefined = undefined
  export let subdomains: string | string[] | undefined = undefined
  export let tileSize: number | undefined = undefined
  export let minZoom: number | undefined = undefined
  export let maxZoom: number | undefined = undefined

  let layer: TileLayerClass | null = null

  onMount(() => {
    const map = useMap()
    if (!map) return
    const opts: Record<string, unknown> = {}
    if (attribution !== undefined) opts.attribution = attribution
    if (subdomains !== undefined) opts.subdomains = subdomains
    if (tileSize !== undefined) opts.tileSize = tileSize
    if (minZoom !== undefined) opts.minZoom = minZoom
    if (maxZoom !== undefined) opts.maxZoom = maxZoom
    layer = tileLayer(url, opts).addTo(map) as TileLayerClass
  })

  onDestroy(() => {
    layer?.remove?.()
    layer = null
  })
</script>
