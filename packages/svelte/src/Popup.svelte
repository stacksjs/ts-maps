<script lang="ts">
  import type { Popup as PopupClass } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { popup } from 'ts-maps'
  import { useMap } from './useMap'

  export let position: [number, number] | undefined = undefined
  export let content: string = ''

  let instance: PopupClass | null = null

  onMount(() => {
    const map = useMap()
    if (!map) return
    const p = popup() as PopupClass
    if (position) (p as unknown as { setLatLng: (l: [number, number]) => void }).setLatLng(position)
    ;(p as unknown as { setContent: (c: string) => void }).setContent(content)
    ;(p as unknown as { addTo: (m: unknown) => void }).addTo(map)
    instance = p
  })

  onDestroy(() => {
    instance?.remove?.()
    instance = null
  })
</script>
