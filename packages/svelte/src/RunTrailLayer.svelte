<script lang="ts">
  /** The live trail behind a runner. */
  import { onDestroy, onMount } from 'svelte'
  import { RunTrailLayer as TsRunTrailLayer } from 'ts-maps'
  import { useMap } from './useMap'

  export let track: number[][] | undefined = undefined
  export let color: string | undefined = undefined
  export let weight: number | undefined = undefined
  export let showPotential: boolean | undefined = undefined
  export let options: Record<string, unknown> | undefined = undefined

  let layer: TsRunTrailLayer | null = null

  // Captured when the layer is built rather than read again at teardown:
  // `getContext` is only valid during component initialisation, and asking for
  // it in onDestroy throws — which left the layer attached to a dead map.
  let attachedTo: any = null

  onMount(() => {
    const map = useMap()
    if (!map) return
    attachedTo = map
    layer = new TsRunTrailLayer({
      ...options,
      ...(color === undefined ? {} : { color }),
      ...(weight === undefined ? {} : { weight }),
      ...(showPotential === undefined ? {} : { showPotential }),
    })
    ;(map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
  })

  $: if (layer && track) layer.setTrack(track)

  onDestroy(() => {
    if (layer && attachedTo)
      (attachedTo as { removeLayer: (l: any) => void }).removeLayer(layer)
    layer = null
    attachedTo = null
  })
</script>

<slot />
