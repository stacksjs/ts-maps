<script lang="ts">
  /**
   * Look Around, after Apple Maps: a binoculars button that shows the streets
   * with pictures, and a full-bleed viewer to turn in and walk through them.
   *
   * ```svelte
   * <Map center={[48.8606, 2.3376]} zoom={16}>
   *   <LookAround bind:choosing {at} onReady={(c) => (look = c)} />
   *   <Search lookAround={look} />
   * </Map>
   * ```
   *
   * `provider`, `position`, `choosing`, `at` and `heading` are followed as
   * they change; `choosing`, `at` and `heading` only when they change, so the
   * viewer closed by its own Done stays closed. `choosing` can be bound.
   * `miniMap`, `locale` and `title` are read when the control is made: a new
   * one makes it again. Events are callback props with the same names the
   * other bindings use — `onOpen`, `onClose`, `onImageChange`,
   * `onViewChange`, `onChoosingChange`, `onNotFound`.
   */
  import type { LatLngLike, Map as MapInstance, StreetImageryProvider } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { LOOK_AROUND_EVENTS, LookAround } from 'ts-maps'
  import { useMap } from './useMap'

  /** Where pictures come from. Default Panoramax. */
  export let provider: StreetImageryProvider | undefined = undefined
  export let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined = undefined
  /** The small map in the viewer's corner. Default true. */
  export let miniMap: boolean | undefined = undefined
  /** The language of its words. Default the map's `locale`, else the browser's. */
  export let locale: string | undefined = undefined
  export let title: string | undefined = undefined
  export let choosing: boolean | undefined = undefined
  /** Look from the picture nearest here; `null` to close. */
  export let at: LatLngLike | null | undefined = undefined
  export let heading: number | undefined = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((control: LookAround) => void) | undefined = undefined
  export let onOpen: ((e: any) => void) | undefined = undefined
  export let onClose: ((e: any) => void) | undefined = undefined
  export let onImageChange: ((e: any) => void) | undefined = undefined
  export let onViewChange: ((e: any) => void) | undefined = undefined
  export let onChoosingChange: ((e: any) => void) | undefined = undefined
  export let onNotFound: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let map: MapInstance | null = null
  let look: LookAround | null = null
  let unlisten: (() => void) | null = null

  // Read at the moment of the event, so a changed handler is honoured.
  const handler = (prop: string): ((e: any) => void) | undefined => ({
    onOpen, onClose, onImageChange, onViewChange, onChoosingChange, onNotFound,
  } as Record<string, ((e: any) => void) | undefined>)[prop]

  function teardown(): void {
    unlisten?.()
    unlisten = null
    look?.remove()
    look = null
  }

  function build(mini: boolean | undefined, words: string | undefined, label: string | undefined): void {
    teardown()
    if (!map) return
    const made = new LookAround({ provider, position, miniMap: mini, locale: words, title: label })
    made.addTo(map)
    unlisten = made.listen((type, e) => {
      // Kept in step, so `bind:choosing` sees the button and a tap.
      if (type === 'choosingchange') choosing = e.choosing
      handler(LOOK_AROUND_EVENTS[type])?.(e)
    })
    look = made
    onReady?.(made)
  }

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const contextMap = useMap()

  onMount(() => {
    map = contextMap
  })

  $: if (map) build(miniMap, locale, title)
  // The control follows `choosing`, `at` and `heading` only when they change,
  // and compares `at` by value.
  $: if (look) look.sync({ provider, position, choosing, at, heading })

  onDestroy(() => {
    teardown()
  })
</script>
