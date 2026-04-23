<script lang="ts">
  import type { Marker as MarkerClass } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { marker } from 'ts-maps'
  import { useMap } from './useMap'

  export let position: [number, number]
  export let draggable: boolean | undefined = undefined
  export let title: string | undefined = undefined

  let instance: MarkerClass | null = null

  onMount(() => {
    const map = useMap()
    if (!map) return
    const opts: Record<string, unknown> = {}
    if (draggable !== undefined) opts.draggable = draggable
    if (title !== undefined) opts.title = title
    instance = marker(position, opts).addTo(map) as MarkerClass
  })

  onDestroy(() => {
    instance?.remove?.()
    instance = null
  })
</script>

<slot />
