<script lang="ts">
  /**
   * A style-spec source. Give the whole spec as `source`, as the React and
   * Vue bindings take it, or its fields as props. Read once; removed when the
   * component is destroyed.
   */
  import { onDestroy, onMount } from 'svelte'
  import { useMap } from './useMap'

  export let id: string
  /** The source spec, such as `{ type: 'geojson', data }`. Wins over the props below. */
  export let source: Record<string, unknown> | undefined = undefined
  export let type: 'vector' | 'raster' | 'raster-dem' | 'geojson' | undefined = undefined
  /** A TileJSON URL, in place of `tiles`. */
  export let url: string | undefined = undefined
  export let tiles: string[] | undefined = undefined
  export let tileSize: number | undefined = undefined
  export let data: unknown = undefined

  type StyleApi = {
    addSource: (id: string, source: Record<string, unknown>) => void
    removeSource: (id: string) => void
  }

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const map = useMap() as unknown as StyleApi | null
  let added: string | null = null

  onMount(() => {
    if (!map) return
    let spec = source
    if (!spec) {
      spec = { type }
      if (url !== undefined) spec.url = url
      if (tiles) spec.tiles = tiles
      if (tileSize !== undefined) spec.tileSize = tileSize
      if (data !== undefined) spec.data = data
    }
    map.addSource(id, spec)
    added = id
  })

  onDestroy(() => {
    if (!map || added === null) return
    try {
      map.removeSource(added)
    }
    catch {
      // The map went first (Svelte 4 destroys a parent before its children).
    }
    added = null
  })
</script>
