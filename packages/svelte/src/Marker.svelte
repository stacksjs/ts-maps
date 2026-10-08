<script lang="ts">
  import type { Marker as MarkerClass } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { marker } from 'ts-maps'
  import { useMap } from './useMap'

  /** `[lat, lng]`. Followed. With `bind:position`, a drag writes it back. */
  export let position: [number, number]
  /** Anything the core `Marker` takes: `icon`, `draggable`, `title`, `opacity`, … Read once. */
  export let options: Record<string, unknown> | undefined = undefined
  /** Short for `options.draggable`. Read once. */
  export let draggable: boolean | undefined = undefined
  /** Short for `options.title`. Read once. */
  export let title: string | undefined = undefined
  /* eslint-disable no-unused-vars */
  export let onClick: ((e: any) => void) | undefined = undefined
  export let onDragEnd: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const map = useMap()
  let instance: MarkerClass | null = null

  onMount(() => {
    if (!map) return
    const opts: Record<string, unknown> = { ...options }
    if (draggable !== undefined) opts.draggable = draggable
    if (title !== undefined) opts.title = title
    const m = marker(position, opts) as MarkerClass
    // Handlers are read when the event fires, so a new one is honoured.
    m.on('click', (e: any) => onClick?.(e))
    m.on('dragend', (e: any) => {
      const at = m.getLatLng()
      position = [at.lat, at.lng]
      onDragEnd?.(e)
    })
    instance = m.addTo(map) as MarkerClass
  })

  function follow(m: MarkerClass, to: [number, number]): void {
    const at = m.getLatLng()
    if (at.lat !== to[0] || at.lng !== to[1])
      m.setLatLng(to)
  }

  $: if (instance && position) follow(instance, position)

  onDestroy(() => {
    instance?.remove?.()
    instance = null
  })
</script>

<slot />
