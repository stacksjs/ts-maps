<script lang="ts">
  // Slot content has to be authored in a component, so the landmark and the
  // trees are exercised through this rather than from a test file.
  import Landmark from '../../src/Landmark.svelte'
  import Map from '../../src/Map.svelte'
  import Trees from '../../src/Trees.svelte'

  export let model: any
  export let center: [number, number]
  export let rotation: number | undefined = undefined
  export let replace: boolean | undefined = undefined
  export let spacing: number | undefined = undefined
  export let landmark: any = null
  export let trees: any = null

  export function set(next: { rotation?: number, replace?: boolean, spacing?: number }): void {
    if ('rotation' in next) rotation = next.rotation
    if ('replace' in next) replace = next.replace
    if ('spacing' in next) spacing = next.spacing
  }

  export function getLandmark(): any {
    return landmark
  }

  export function getTrees(): any {
    return trees
  }
</script>

<Map {center} zoom={17}>
  <Landmark {model} position={center} {rotation} {replace} onReady={(l) => { landmark = l }} />
  <Trees {spacing} onReady={(t) => { trees = t }} />
</Map>
