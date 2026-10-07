<script lang="ts">
  // Slot content has to be authored in a component, so the control is
  // exercised through this rather than from a test file.
  import IndoorMap from '../../src/IndoorMap.svelte'
  import Map from '../../src/Map.svelte'
  import Search from '../../src/Search.svelte'

  export let venue: any
  export let center: [number, number]
  export let events: Array<[string, unknown]> = []
  export let level: number | undefined = undefined
  export let control: any = null
  export let search: any = undefined

  export function setLevel(next: number): void {
    level = next
  }

  export function getControl(): any {
    return control
  }

  export function getSearch(): any {
    return search
  }

  export function state(): { level: number | undefined } {
    return { level }
  }
</script>

<Map {center} zoom={17}>
  <Search provider={null} offline={null} recents={false} details={null} saved={null} onReady={(c) => { search = c }} />
  <IndoorMap
    {venue}
    {search}
    bind:level
    onReady={(c) => { control = c }}
    onLevelChange={(e) => events.push(['levelchange', e.level])}
  />
</Map>
