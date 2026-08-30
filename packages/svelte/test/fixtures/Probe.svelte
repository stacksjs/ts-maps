<script lang="ts">
  // Hands the map back to a test. There is no other way in from outside: the
  // instance lives on the context, which only a child component can read.
  import { onMount } from 'svelte'
  import { useMap } from '../../src/useMap'

  export let onmap: (map: unknown) => void
  export let event: string | undefined = undefined
  export let onevent: (() => void) | undefined = undefined

  const map = useMap()

  if (event && onevent && map) {
    // Registered here rather than in onMount, matching how useMapEvent is
    // meant to be called.
    map.on(event, onevent)
  }

  onMount(() => {
    onmap(useMap())
  })
</script>
