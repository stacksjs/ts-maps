import type { MarkerConfig } from 'ts-maps'
import { VectorMap } from 'ts-maps'
// import world from '../packages/ts-maps/src/maps/world'
// Try using world-merc instead as it might have better projection
import worldMerc from '../packages/ts-maps/src/maps/world-merc'

// Register the map data
// VectorMap.addMap('world', world)
VectorMap.addMap('world_merc', worldMerc)

const markers: MarkerConfig[] = [
  { name: 'Russia', coords: [61, 105] as [number, number] },
  { name: 'Greenland', coords: [72, -42] as [number, number] },
  { name: 'Canada', coords: [56.1304, -106.3468] as [number, number] },
  { name: 'Palestine', coords: [31.5, 34.8] as [number, number] },
  { name: 'Brazil', coords: [-14.2350, -51.9253] as [number, number] },
  { name: 'Turkey', coords: [39.0, 35.0] as [number, number] },
]

// Create the map instance
const _map = new VectorMap({
  // Use the world_merc map that is actually loaded
  map: { name: 'world_merc', projection: 'mercator' },
  selector: '#map',
  zoomButtons: true,
  backgroundColor: '#f8fafc',

  // Don't set initial focus - let the map determine the best view
  // focusOn: {
  //   scale: 0.8,
  //   x: 0.5,
  //   y: 0.5,
  //   animate: false
  // },

  // Set zoom limits to prevent extreme zooming
  zoomMin: 0.6,
  zoomMax: 8,
  zoomOnScroll: true,
  zoomOnScrollSpeed: 1.5,

  regionsSelectable: true,
  markersSelectable: true,
  markersSelectableOne: true,

  regionStyle: {
    initial: {
      fill: '#d1d5db',
      stroke: '#9ca3af',
      strokeWidth: 0.5,
    },
    hover: {
      fill: '#a5b4fc',
      stroke: '#6366f1',
      strokeWidth: 0.5,
    },
    selected: {
      fill: '#818cf8',
      stroke: '#4f46e5',
      strokeWidth: 0.5,
    },
  },

  // Labels
  labels: {
    markers: {
      render: (marker: MarkerConfig) => marker.name,
    },
    // Completely disable region labels
    regions: null,
  },

  // Marker and label style
  markers,
  markerStyle: {
    initial: {
      fill: '#4f46e5',
      r: 6,
      stroke: '#ffffff',
      strokeWidth: 1,
    },
    hover: {
      fill: '#4338ca',
      r: 8,
    },
    selected: {
      fill: '#312e81',
      r: 8,
    },
  },

  // Event handling
  onLoaded(): void {
    // eslint-disable-next-line no-console
    console.log('Map loaded:', this)

    // Get container dimensions
    const containerWidth = this.container.clientWidth
    const containerHeight = this.container.clientHeight

    // Set SVG dimensions to match container
    this._width = containerWidth
    this._height = containerHeight
    this.canvas.setSize(containerWidth, containerHeight)

    // Force resize to ensure proper display
    this.updateSize()

    // Set timeout to ensure the map has fully rendered before adjusting
    setTimeout(() => {
      // Reset to default view
      this.reset()

      // Set the scale to show the entire world
      this._setScale(1)

      // Center the map
      this.transX = 0
      this.transY = 0

      // Apply the transform
      this._applyTransform()
    }, 100)
  },

  onViewportChange: (x: number, y: number, z: number): void => {
    // eslint-disable-next-line no-console
    console.log('Viewport changed:', x, y, z)
  },

  onRegionSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]): void => {
    // eslint-disable-next-line no-console
    console.log('Region selected:', code, isSelected, selectedRegions)
  },

  onRegionTooltipShow: (_event: Event, tooltip: any, code: string): void => {
    // Get region name safely
    let regionName = ''
    if (typeof tooltip.text === 'function') {
      regionName = tooltip.text()
    }
    else if (tooltip.textContent) {
      regionName = tooltip.textContent
    }
    else {
      regionName = code // Fallback to code if text is not available
    }

    // Set tooltip content safely
    if (typeof tooltip.html === 'function') {
      tooltip.html(`<strong>${regionName}</strong><br><small>(Code: ${code})</small>`)
    }
    else if (tooltip.innerHTML !== undefined) {
      tooltip.innerHTML = `<strong>${regionName}</strong><br><small>(Code: ${code})</small>`
    }

    // Log for debugging
    // eslint-disable-next-line no-console
    console.log('Region tooltip:', { code, name: regionName })
  },

  onMarkerSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedMarkers: string[]): void => {
    // eslint-disable-next-line no-console
    console.log('Marker selected:', code, isSelected, selectedMarkers)
  },

  onMarkerTooltipShow: (_event: Event, tooltip: any, _code: string): void => {
    // Get marker name safely
    let markerName = ''
    if (typeof tooltip.text === 'function') {
      markerName = tooltip.text()
    }
    else if (tooltip.textContent) {
      markerName = tooltip.textContent
    }

    // Set tooltip content safely
    if (typeof tooltip.html === 'function') {
      tooltip.html(`<strong>${markerName}</strong>`)
    }
    else if (tooltip.innerHTML !== undefined) {
      tooltip.innerHTML = `<strong>${markerName}</strong>`
    }
  },
})
