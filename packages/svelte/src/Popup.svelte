<script lang="ts">
  import type { Popup as PopupClass } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { popup } from 'ts-maps'
  import { useMap } from './useMap'

  /** `[lat, lng]`. Followed. */
  export let position: [number, number] | undefined = undefined
  /** HTML content. Followed. */
  export let content: string = ''
  /** Anything the core `Popup` takes: `maxWidth`, `closeButton`, `className`, … Read once. */
  export let options: Record<string, unknown> | undefined = undefined

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const map = useMap()
  let instance: PopupClass | null = null

  onMount(() => {
    if (!map) return
    const p = popup(options) as PopupClass
    if (position) p.setLatLng(position)
    p.setContent(content)
    ;(p as unknown as { addTo: (m: unknown) => void }).addTo(map)
    instance = p
  })

  $: if (instance && position) instance.setLatLng(position)
  $: if (instance) instance.setContent(content)

  onDestroy(() => {
    instance?.remove?.()
    instance = null
  })
</script>
