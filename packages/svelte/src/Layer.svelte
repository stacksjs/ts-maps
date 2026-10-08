<script lang="ts">
  /**
   * A style-spec layer. Give the whole spec as `layer`, as the React and Vue
   * bindings take it, or its fields as props. Read once; removed when the
   * component is destroyed.
   */
  import { onDestroy, onMount } from 'svelte'
  import { useMap } from './useMap'

  /** The layer spec, such as `{ id, type: 'circle', source }`. Wins over the props below. */
  export let layer: { id: string, type: string, [key: string]: unknown } | undefined = undefined
  /** Put the layer below the layer with this id. */
  export let before: string | undefined = undefined
  export let id: string | undefined = undefined
  export let type: 'fill' | 'line' | 'circle' | 'symbol' | 'raster' | 'background' | 'fill-extrusion' | 'heatmap' | 'hillshade' | undefined = undefined
  export let source: string | undefined = undefined
  export let sourceLayer: string | undefined = undefined
  export let paint: Record<string, unknown> | undefined = undefined
  export let layout: Record<string, unknown> | undefined = undefined
  export let filter: unknown = undefined

  type StyleApi = {
    addStyleLayer: (spec: Record<string, unknown>, before?: string) => void
    removeStyleLayer: (id: string) => void
  }

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const map = useMap() as unknown as StyleApi | null
  let added: string | null = null

  onMount(() => {
    if (!map) return
    let spec: Record<string, unknown> | undefined = layer
    if (!spec) {
      spec = { id, type }
      if (source) spec.source = source
      if (sourceLayer) spec['source-layer'] = sourceLayer
      if (paint) spec.paint = paint
      if (layout) spec.layout = layout
      if (filter !== undefined) spec.filter = filter
    }
    map.addStyleLayer(spec, before)
    added = spec.id as string
  })

  onDestroy(() => {
    if (!map || added === null) return
    try {
      map.removeStyleLayer(added)
    }
    catch {
      // The map went first (Svelte 4 destroys a parent before its children).
    }
    added = null
  })
</script>
