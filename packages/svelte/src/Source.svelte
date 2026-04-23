<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { useMap } from './useMap'

  export let id: string
  export let type: 'vector' | 'raster' | 'raster-dem' | 'geojson'
  export let tiles: string[] | undefined = undefined
  export let tileSize: number | undefined = undefined
  export let data: unknown = undefined

  let added = false

  onMount(() => {
    const map = useMap() as unknown as {
      addSource?: (id: string, source: Record<string, unknown>) => void
      removeSource?: (id: string) => void
    } | null
    if (!map?.addSource) return
    const source: Record<string, unknown> = { type }
    if (tiles) source.tiles = tiles
    if (tileSize !== undefined) source.tileSize = tileSize
    if (data !== undefined) source.data = data
    map.addSource(id, source)
    added = true
  })

  onDestroy(() => {
    if (!added) return
    const map = useMap() as unknown as { removeSource?: (id: string) => void } | null
    map?.removeSource?.(id)
  })
</script>
