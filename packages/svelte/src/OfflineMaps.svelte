<script lang="ts">
  /**
   * Offline maps, after Apple Maps: a button opening the list of downloaded
   * maps, an area picker with an estimated size, and a pill when the
   * connection drops.
   *
   * ```svelte
   * <Map center={[37.78, -122.42]} zoom={13}>
   *   <OfflineMaps bind:open onComplete={({ region }) => toast(region.name)} />
   * </Map>
   * ```
   *
   * Options are read when the component mounts; `open` and `onlyOffline`
   * are followed as they change, and both can be bound. Events are callback
   * props with the same names the other bindings use — `onChange`,
   * `onProgress`, `onComplete`, …
   */
  import type { OfflineMapsControlOptions, OfflineMaps as TsOfflineMapsManager } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { OFFLINE_MAPS_EVENTS, OfflineMapsControl } from 'ts-maps'
  import { useMap } from './useMap'

  export let open: boolean | undefined = undefined
  export let onlyOffline: boolean | undefined = undefined
  export let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined = undefined
  export let maps: TsOfflineMapsManager | undefined = undefined
  export let geocoder: OfflineMapsControlOptions['geocoder'] = undefined
  export let resources: string[] | undefined = undefined
  export let showStatus: boolean | undefined = undefined
  export let title: string | undefined = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((control: OfflineMapsControl) => void) | undefined = undefined
  export let onChange: ((e: any) => void) | undefined = undefined
  export let onProgress: ((e: any) => void) | undefined = undefined
  export let onComplete: ((e: any) => void) | undefined = undefined
  export let onError: ((e: any) => void) | undefined = undefined
  export let onDelete: ((e: any) => void) | undefined = undefined
  export let onModeChange: ((e: any) => void) | undefined = undefined
  export let onOpenChange: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let offline: OfflineMapsControl | null = null
  let unlisten: (() => void) | null = null

  // Read at the moment of the event, so a changed handler is honoured.
  const handler = (prop: string): ((e: any) => void) | undefined => ({
    onChange, onProgress, onComplete, onError, onDelete, onModeChange, onOpenChange,
  } as Record<string, ((e: any) => void) | undefined>)[prop]

  onMount(() => {
    const map = useMap()
    if (!map) return
    offline = new OfflineMapsControl({ position, maps, geocoder, resources, showStatus, title })
    offline.addTo(map)
    unlisten = offline.listen((type, e) => {
      // Kept in step, so `bind:open` and `bind:onlyOffline` see the panel's
      // own ✕ and switch.
      if (type === 'openchange') open = e.open
      else if (type === 'modechange') onlyOffline = e.onlyOffline
      handler(OFFLINE_MAPS_EVENTS[type])?.(e)
    })
    onReady?.(offline)
  })

  $: if (offline) offline.sync({ open, onlyOffline })

  onDestroy(() => {
    unlisten?.()
    offline?.remove()
    offline = null
  })
</script>
