<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { useMap } from './useMap'

  export let id: string
  export let type: 'fill' | 'line' | 'circle' | 'symbol' | 'raster' | 'background' | 'fill-extrusion'
  export let source: string | undefined = undefined
  export let sourceLayer: string | undefined = undefined
  export let paint: Record<string, unknown> | undefined = undefined
  export let layout: Record<string, unknown> | undefined = undefined
  export let filter: unknown = undefined

  let added = false

  onMount(() => {
    const map = useMap() as unknown as {
      addStyleLayer?: (spec: Record<string, unknown>) => void
      removeStyleLayer?: (id: string) => void
    } | null
    if (!map?.addStyleLayer) return
    const spec: Record<string, unknown> = { id, type }
    if (source) spec.source = source
    if (sourceLayer) spec['source-layer'] = sourceLayer
    if (paint) spec.paint = paint
    if (layout) spec.layout = layout
    if (filter !== undefined) spec.filter = filter
    map.addStyleLayer(spec)
    added = true
  })

  onDestroy(() => {
    if (!added) return
    const map = useMap() as unknown as { removeStyleLayer?: (id: string) => void } | null
    map?.removeStyleLayer?.(id)
  })
</script>
