<script lang="ts">
  /**
   * Territories on the map.
   *
   * ```svelte
   * <Map center={[34.02, -118.47]} zoom={16}>
   *   <TerritoryLayer {store} self="me" />
   * </Map>
   * ```
   */
  import type { TerritoryStore, TerritoryStyle } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { TerritoryLayer as TsTerritoryLayer } from 'ts-maps'
  import { useMap } from './useMap'

  export let store: TerritoryStore | undefined = undefined
  export let styles: Record<string, TerritoryStyle> | undefined = undefined
  export let self: string | undefined = undefined
  export let captureDuration: number | undefined = undefined
  export let labelMinZoom: number | undefined = undefined
  export let units: 'metric' | 'imperial' | undefined = undefined
  export let options: Record<string, unknown> | undefined = undefined

  let layer: TsTerritoryLayer | null = null

  // Captured when the layer is built rather than read again at teardown:
  // `getContext` is only valid during component initialisation, and asking for
  // it in onDestroy throws — which left the layer attached to a dead map.
  let attachedTo: any = null

  onMount(() => {
    const map = useMap()
    if (!map) return
    attachedTo = map
    layer = new TsTerritoryLayer({
      ...options,
      ...(store ? { store } : {}),
      ...(styles ? { styles } : {}),
      ...(self === undefined ? {} : { self }),
      ...(captureDuration === undefined ? {} : { captureDuration }),
      ...(labelMinZoom === undefined ? {} : { labelMinZoom }),
      ...(units === undefined ? {} : { units }),
    })
    ;(map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
  })

  // Swapping the store swaps what is drawn without rebuilding the layer.
  $: if (layer && store) layer.setStore(store)

  onDestroy(() => {
    if (layer && attachedTo)
      (attachedTo as { removeLayer: (l: any) => void }).removeLayer(layer)
    layer = null
    attachedTo = null
  })
</script>

<slot />
