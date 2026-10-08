<script lang="ts">
  // A <Map> whose props a test can change after mount, with the children the
  // parity tests need. Slot content has to be authored in a component.
  import Layer from '../../src/Layer.svelte'
  import Map from '../../src/Map.svelte'
  import Marker from '../../src/Marker.svelte'
  import Popup from '../../src/Popup.svelte'
  import ScaleControl from '../../src/ScaleControl.svelte'
  import TileLayer from '../../src/TileLayer.svelte'
  import Source from '../../src/Source.svelte'
  import Probe from './Probe.svelte'

  export let onmap: (map: unknown) => void
  export let mapProps: Record<string, unknown> = {}
  export let withMarker = false
  export let markerProps: Record<string, unknown> = {}
  export let withData = false
  export let withExtras = false
  let extras: { scalePosition: 'topleft' | 'bottomleft', popupPosition: [number, number], popupContent: string, tileUrl: string } = {
    scalePosition: 'bottomleft',
    popupPosition: [34.02, -118.47],
    popupContent: 'First',
    tileUrl: 'https://a.test/{z}/{x}/{y}.png',
  }

  export function setExtras(next: Partial<typeof extras>): void {
    extras = { ...extras, ...next }
  }

  let markerPosition: [number, number] = [34.02, -118.47]

  const points = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-118.47, 34.02] } }],
  }

  export function setMap(next: Record<string, unknown>): void {
    mapProps = { ...mapProps, ...next }
  }

  export function setMarkerPosition(next: [number, number]): void {
    markerPosition = next
  }

  export function getMarkerPosition(): [number, number] {
    return markerPosition
  }

  export function setData(next: boolean): void {
    withData = next
  }
</script>

<Map {...mapProps}>
  <Probe {onmap} />
  {#if withMarker}
    <Marker bind:position={markerPosition} {...markerProps} />
  {/if}
  {#if withData}
    <Source id="spec" source={{ type: 'geojson', data: points }} />
    <Layer layer={{ id: 'spec', type: 'circle', source: 'spec' }} />
    <Source id="flat" type="geojson" data={points} />
    <Layer id="flat" type="circle" source="flat" before="spec" />
  {/if}
  {#if withExtras}
    <ScaleControl position={extras.scalePosition} imperial={false} />
    <Popup position={extras.popupPosition} content={extras.popupContent} options={{ className: 'extra-popup' }} />
    <TileLayer url={extras.tileUrl} />
  {/if}
</Map>
