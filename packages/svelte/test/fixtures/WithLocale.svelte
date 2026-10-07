<script lang="ts">
  // Slot content has to be authored in a component, so locale is exercised
  // through this rather than from a test file.
  import Map from '../../src/Map.svelte'
  import Search from '../../src/Search.svelte'
  import ZoomControl from '../../src/ZoomControl.svelte'

  export let locale: string | undefined = undefined
  let own: string | undefined

  export function setOwn(value: string | undefined): void {
    own = value
  }
</script>

<Map center={[37.79, -122.4]} zoom={15} {locale}>
  <Search provider={null} offline={null} recents={false} details={null} locale={own} />
  <ZoomControl position="topright" locale={own} />
</Map>
