<script lang="ts">
  /**
   * The map type picker, after Apple Maps: a card of map types, Explore,
   * Driving and Satellite, that sets the map's style and keeps the layers the
   * page added to it.
   *
   * ```svelte
   * <Map center={[37.78, -122.42]} zoom={13}>
   *   <MapType types={mapTypes({ tiles, imagery })} bind:value bind:open />
   * </Map>
   * ```
   *
   * Every prop is followed as it changes: a new `value` shows that type, a
   * new `types` redraws the card, a new `position` moves the button. Given a
   * `traffic` layer, the card has a Traffic switch, and `showTraffic` turns
   * it. `value`, `open` and `showTraffic` can be bound. Events are callback
   * props with the same names the other bindings use — `onChange`,
   * `onOpenChange`, `onTrafficChange`.
   */
  import type { MapTypeControlOptions, MapTypeOption } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { MAP_TYPE_EVENTS, MapTypeControl } from 'ts-maps'
  import { useMap } from './useMap'

  export let types: MapTypeOption[]
  export let value: string | undefined = undefined
  export let open: boolean | undefined = undefined
  export let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined = undefined
  export let title: string | undefined = undefined
  /** A `TrafficLayer`, for a Traffic switch on the card. Read at mount. */
  export let traffic: MapTypeControlOptions['traffic'] = undefined
  export let showTraffic: boolean | undefined = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((control: MapTypeControl) => void) | undefined = undefined
  export let onChange: ((e: any) => void) | undefined = undefined
  export let onOpenChange: ((e: any) => void) | undefined = undefined
  export let onTrafficChange: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let picker: MapTypeControl | null = null
  let unlisten: (() => void) | null = null

  // Read at the moment of the event, so a changed handler is honoured.
  const handler = (prop: string): ((e: any) => void) | undefined => ({
    onChange, onOpenChange, onTrafficChange,
  } as Record<string, ((e: any) => void) | undefined>)[prop]

  onMount(() => {
    const map = useMap()
    if (!map) return
    picker = new MapTypeControl({ types, value, position, title, traffic })
    picker.addTo(map)
    unlisten = picker.listen((type, e) => {
      // Kept in step, so `bind:value`, `bind:open` and `bind:showTraffic`
      // see a choice made on the card and its own ✕.
      if (type === 'change') value = e.value
      else if (type === 'openchange') open = e.open
      else if (type === 'trafficchange') showTraffic = e.traffic
      handler(MAP_TYPE_EVENTS[type])?.(e)
    })
    onReady?.(picker)
  })

  // The control follows `value`, `open` and `showTraffic` only when they
  // change, so one already in step is left alone.
  $: if (picker) picker.sync({ types, value, open, position, showTraffic })

  onDestroy(() => {
    unlisten?.()
    picker?.remove()
    picker = null
  })
</script>
