<script lang="ts">
  // Slot content has to be authored in a component, so search is exercised
  // through this rather than from a test file.
  import Map from '../../src/Map.svelte'
  import Search from '../../src/Search.svelte'

  export let provider: any
  export let events: Array<[string, unknown]> = []
  export let control: any = null
  let query: string | undefined
  let categories: any
  let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined

  export function setQuery(value: string): void {
    query = value
  }

  export function setProvider(value: any): void {
    provider = value
  }

  export function setCategories(value: any): void {
    categories = value
  }

  export function setPosition(value: typeof position): void {
    position = value
  }

  export function getControl(): any {
    return control
  }
</script>

<Map center={[37.79, -122.4]} zoom={15}>
  <Search
    {provider}
    {categories}
    {position}
    offline={null}
    recents={false}
    {query}
    onReady={(c) => { control = c }}
    onResults={(e) => events.push(['results', e.places.map((p) => p.name)])}
    onSelect={(e) => events.push(['select', e.place.name])}
  />
</Map>
