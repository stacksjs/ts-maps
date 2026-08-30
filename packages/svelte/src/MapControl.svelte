<script lang="ts">
  /**
   * The lifecycle behind every control component.
   *
   * Svelte components cannot be generated from a factory the way the React,
   * Vue and Solid bindings do it, so the add/remove logic lives here once and
   * the named components (`NavigationControl`, `GeocoderControl`, …) are
   * one-line wrappers around it. Nothing is forked per control.
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

  let instance: { remove?: () => unknown } | null = null

  onMount(() => {
    const map = useMap()
    if (!map) return

    const factory = (control as unknown as Record<string, (o?: unknown) => any>)[type]
    if (typeof factory !== 'function') return

    instance = factory({
      ...(position ? { position } : {}),
      ...options,
    })
    ;(instance as { addTo: (m: unknown) => unknown }).addTo(map)
  })

  onDestroy(() => {
    instance?.remove?.()
    instance = null
  })
</script>
