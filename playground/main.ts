import { VectorMap } from 'ts-maps'
import 'ts-maps/maps/world-merc'
import 'ts-maps/scss/vector-map.scss'
import type { MarkerConfig, MapInterface } from 'ts-maps'

const markers: MarkerConfig[] = [
  { name: 'Russia', coords: [61, 105] as [number, number] },
  { name: 'Greenland', coords: [72, -42] as [number, number] },
  { name: 'Canada', coords: [56.1304, -106.3468] as [number, number] },
  { name: 'Palestine', coords: [31.5, 34.8] as [number, number] },
  { name: 'Brazil', coords: [-14.2350, -51.9253] as [number, number] },
]

const map = new VectorMap({
  map: { name: 'world_merc', projection: 'mercator' },
  selector: '#map',
  zoomButtons: false,

  regionsSelectable: true,
  markersSelectable: true,
  markersSelectableOne: true,

  regionStyle: {
    initial: { fill: '#d1d5db' }
  },

  // Labels
  labels: {
    markers: {
      render: (marker: MarkerConfig) => marker.name,
    },
  },

  // Marker and label style
  markers,
  markerStyle: { initial: { fill: '#66F' } },

  // Event handling
  onLoaded: function(): void {
    console.log(map)
  },

  onViewportChange: (x: number, y: number, z: number): void => {
    console.log(x, y, z)
  },

  onRegionSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]): void => {
    console.log(code, isSelected, selectedRegions)
  },

  onRegionTooltipShow: (_event: Event, tooltip, code: string): void => {
    console.log(tooltip, code)
    tooltip.css({ backgroundColor: 'white', color: '#35373e' })
          .text(tooltip.text() + ' (Hello World `region`)')
  },

  onMarkerSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedMarkers: string[]): void => {
    console.log(code, isSelected, selectedMarkers)
  },

  onMarkerTooltipShow: (_event: Event, tooltip, code: string): void => {
    tooltip.text(tooltip.text() + ' (Hello World (marker))')
  },
})
