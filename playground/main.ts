import { VectorMap } from 'ts-maps'
import 'ts-maps/maps/world-merc'
import 'ts-maps/scss/vector-map.scss'
import type { MarkerConfig } from 'ts-maps'

const markers = [
  { name: 'Russia', coords: [61, 105] },
  { name: 'Greenland', coords: [72, -42] },
  { name: 'Canada', coords: [56.1304, -106.3468] },
  { name: 'Palestine', coords: [31.5, 34.8] },
  { name: 'Brazil', coords: [-14.2350, -51.9253] },
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
      render: function(marker: MarkerConfig) {
        return marker.name
      },
    },
  },

  // Marker and label style
  markers: markers,
  markerStyle: { initial: { fill: '#66F' } },

  // Event handling
  onLoaded: function(map) {
    console.log(map)
  },
  onViewportChange: function(x, y, z) {
    console.log(x, y, z)
  },
  onRegionSelected: function (index, isSelected, selectedRegions) {
    console.log(index, isSelected, selectedRegions)
  },
  onRegionTooltipShow: function (event, tooltip, index) {
    console.log(tooltip, index)
    console.log(tooltip)

    tooltip.css({ backgroundColor: 'white', color: '#35373e' }).text(
      tooltip.text() + ' (Hello World `region`)'
    )
  },
  onMarkerSelected: function (code, isSelected, selectedMarkers) {
    console.log(code, isSelected, selectedMarkers)
  },
  onMarkerTooltipShow: function (event, tooltip, code) {
    tooltip.text(
      tooltip.text() + ' (Hello World (marker))'
    )
  },
})
