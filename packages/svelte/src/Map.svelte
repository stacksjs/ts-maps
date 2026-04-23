<script lang="ts">
  import { onDestroy, onMount, setContext } from 'svelte'
  import { TsMap } from 'ts-maps'
  import { MAP_CONTEXT_KEY, type MapContextValue } from './context'

  export let center: [number, number] | undefined = undefined
  export let zoom: number | undefined = undefined
  export let bearing: number | undefined = undefined
  export let pitch: number | undefined = undefined

  let container: HTMLDivElement | null = null
  let map: TsMap | null = null

  setContext<MapContextValue>(MAP_CONTEXT_KEY, { getMap: () => map })

  onMount(() => {
    if (!container) return
    const options: Record<string, unknown> = {}
    if (center !== undefined) options.center = center
    if (zoom !== undefined) options.zoom = zoom
    if (bearing !== undefined) options.bearing = bearing
    if (pitch !== undefined) options.pitch = pitch
    map = new TsMap(container, options)
  })

  onDestroy(() => {
    try {
      ;(map as unknown as { remove?: () => void } | null)?.remove?.()
    }
    catch {
      // ignore — host is being torn down
    }
    map = null
  })
</script>

<div bind:this={container} class="ts-map" style="width:100%;height:100%">
  {#if map}
    <slot />
  {/if}
</div>
