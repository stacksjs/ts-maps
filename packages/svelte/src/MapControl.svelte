<script lang="ts">
  /**
   * The lifecycle behind every control component.
   *
   * Svelte components cannot be generated from a factory the way the React,
   * Vue and Solid bindings do it, so the add/remove logic lives here once and
   * the named components (`NavigationControl`, `GeocoderControl`, …) are
   * one-line wrappers around it. Nothing is forked per control.
   *
   * A control's own options can be props, as in React and Solid
   * (`<NavigationControl showCompass={false} />`), or go in `options`.
   *
   * `LayersControl` is deliberately absent: it takes dictionaries of live
   * layer instances, which is imperative by nature. Use `useMap()` and
   * `control.layers(...)` for that one.
   */
  import { onDestroy, onMount } from 'svelte'
  import { control } from 'ts-maps'
  import { useMap } from './useMap'

  // Not exported: a type declared in an instance script is not part of the
  // component's public surface. Consumers use the named wrappers.
  type ControlType
    = | 'zoom'
      | 'navigation'
      | 'geocoder'
      | 'fullscreen'
      | 'locate'
      | 'scale'
      | 'attribution'

  export let type: ControlType
  export let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined = undefined
  export let options: Record<string, unknown> | undefined = undefined
  /** The language of its titles. Default the map's `locale`, else the browser's. */
  export let locale: string | undefined = undefined

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const map = useMap()
  let mounted = false
  let instance: { remove?: () => unknown } | null = null

  // Made again for a new `position` or `locale`, as in React: moving a control
  // is making it again, and a control writes its titles when it is built.
  // Its other options, as props or in `options`, are read then.
  function build(at: typeof position, lang: string | undefined): void {
    instance?.remove?.()
    instance = null
    const factory = (control as unknown as Record<string, (o?: unknown) => any>)[type]
    if (!map || typeof factory !== 'function') return

    instance = factory({
      ...$$restProps,
      ...(at ? { position: at } : {}),
      ...(lang ? { locale: lang } : {}),
      ...options,
    })
    ;(instance as { addTo: (m: unknown) => unknown }).addTo(map)
  }

  onMount(() => {
    mounted = true
  })

  $: if (mounted) build(position, locale)

  onDestroy(() => {
    instance?.remove?.()
    instance = null
  })
</script>
