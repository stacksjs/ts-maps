<script lang="ts">
  /**
   * Turn-by-turn navigation, after Apple Maps.
   *
   * ```svelte
   * <Map center={[37.79, -122.39]} zoom={13}>
   *   <TurnByTurn from={[37.7955, -122.3937]} to={[37.8029, -122.4484]} active={driving} onArrive={done} />
   * </Map>
   * ```
   *
   * Setting `from` and `to` previews the routes; `active` starts guidance.
   * Options are read when the component mounts; `from`, `to` and `active`
   * are followed as they change. Events are callback props with the same
   * names the other bindings use — `onPreview`, `onProgress`, `onArrive`, …
   */
  import type { LatLngInput, TurnByTurnOptions } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { TURN_BY_TURN_EVENTS, TurnByTurn as TsTurnByTurn } from 'ts-maps'
  import { useMap } from './useMap'

  export let from: LatLngInput | null | undefined = undefined
  export let to: LatLngInput | null | undefined = undefined
  export let active = false
  export let profile: TurnByTurnOptions['profile'] = undefined
  export let units: TurnByTurnOptions['units'] = undefined
  export let voice: boolean | undefined = undefined
  export let simulate: TurnByTurnOptions['simulate'] = undefined
  export let alternatives: boolean | undefined = undefined
  export let destinationName: string | undefined = undefined
  export let directions: TurnByTurnOptions['directions'] = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((nav: TsTurnByTurn) => void) | undefined = undefined
  export let onPreview: ((e: any) => void) | undefined = undefined
  export let onRouteSelect: ((e: any) => void) | undefined = undefined
  export let onStart: ((e: any) => void) | undefined = undefined
  export let onProgress: ((e: any) => void) | undefined = undefined
  export let onInstruction: ((e: any) => void) | undefined = undefined
  export let onReroute: ((e: any) => void) | undefined = undefined
  export let onArrive: ((e: any) => void) | undefined = undefined
  export let onEnd: ((e: any) => void) | undefined = undefined
  export let onError: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let nav: TsTurnByTurn | null = null

  // Read at the moment of the event, so a changed handler is honoured.
  const handler = (prop: string): ((e: any) => void) | undefined => ({
    onPreview, onRouteSelect, onStart, onProgress, onInstruction, onReroute, onArrive, onEnd, onError,
  } as Record<string, ((e: any) => void) | undefined>)[prop]

  onMount(() => {
    const map = useMap()
    if (!map) return
    nav = new TsTurnByTurn(map, { profile, units, voice, simulate, alternatives, destinationName, directions })
    for (const [event, prop] of Object.entries(TURN_BY_TURN_EVENTS))
      nav.on(event, (e: any) => handler(prop)?.(e))
    onReady?.(nav)
  })

  $: if (nav) nav.sync({ from, to, active })

  onDestroy(() => {
    nav?.stop()
    nav = null
  })
</script>
