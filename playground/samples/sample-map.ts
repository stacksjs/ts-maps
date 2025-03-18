import type { MapData, MarkerConfig } from 'ts-maps'
import { VectorMap } from 'ts-maps'
// import world from '../packages/ts-maps/src/maps/world'
// Try using world-merc instead as it might have better projection
import worldMerc from '../../packages/ts-maps/src/maps/world-merc'

// Register the map data
// VectorMap.addMap('world', world)
VectorMap.addMap('worldMerc', worldMerc)

// Function to set the default blue-gray color for all regions
function setDefaultRegionColors(map: any): void {
  const defaultColor = '#e2e8f0' // Light blue-gray color

  // Get all regions
  const regions = map.regions as Record<string, any>

  // Apply the default color to all regions
  Object.keys(regions).forEach((code) => {
    try {
      const region = regions[code]
      if (region && region.element && region.element.shape && region.element.shape.node) {
        // Set fill color directly on the SVG node
        region.element.shape.node.setAttribute('fill', defaultColor)
        region.element.shape.node.style.fill = defaultColor

        // Update the style object if it exists
        if (region.element.shape.style && region.element.shape.style.initial) {
          region.element.shape.style.initial.fill = defaultColor
        }
      }
    }
    catch (e) {
      console.error(`Error setting default color for ${code}:`, e)
    }
  })

  // Update the default region style to ensure new regions get colored properly
  if (map.params.regionStyle.initial) {
    map.params.regionStyle.initial.fill = defaultColor
  }
}

// Create the map instance
const map = new VectorMap({
  map: { name: 'worldMerc', projection: 'mercator' },
  selector: '#map',
  zoomButtons: true,
  backgroundColor: '#f8fafc',

  // Set default dimensions
  defaultWidth: 1200,
  defaultHeight: 600,

  // Set zoom limits for better Plasta Vista viewing
  zoomMin: 1,
  zoomMax: 12,
  zoomOnScroll: true,
  zoomOnScrollSpeed: 1.2,

  // Initial focus settings
  focus: {
    regions: ['MX'],
    animate: true,
    scale: 4,
  },

  regionsSelectable: true,
  markersSelectable: true,
  markersSelectableOne: true,

  regionStyle: {
    initial: {
      fill: '#e2e8f0',
      stroke: '#cbd5e1',
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

  // Labels configuration
  labels: {
    markers: {
      render: (marker: MarkerConfig) => marker.name,
    },
    regions: null, // Disable region labels
  },

  // Default markers array
  markers: [],

  // Marker style configuration
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
    console.warn('Map loaded:', this)

    // Get container dimensions
    const containerWidth = this.container.clientWidth || 1200
    const containerHeight = this.container.clientHeight || 600

    // Set SVG dimensions to match container
    this._width = containerWidth
    this._height = containerHeight
    this.canvas.setSize(containerWidth, containerHeight)

    // Store default dimensions for reference
    this.defaultWidth = containerWidth
    this.defaultHeight = containerHeight

    // Force resize to ensure proper display
    this.updateSize()

    // Set timeout to ensure the map has fully rendered
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

      // Set default colors for all regions
      setDefaultRegionColors(this)

      // Force redraw of the map
      this.updateSize()
      this._applyTransform()
    }, 100)
  },

  onViewportChange: (x: number, y: number, z: number): void => {
    console.warn('Viewport changed:', x, y, z)
  },

  onRegionSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]): void => {
    console.warn('Region selected:', code, isSelected, selectedRegions)
  },

  onRegionTooltipShow: (_event: Event, tooltip: any, code: string): void => {
    // Get map data
    const mapData = (map as any)._mapData as MapData

    // Get region name from map data
    let regionName = code
    if (mapData.paths && typeof mapData.paths === 'object' && code in mapData.paths) {
      regionName = mapData.paths[code]?.name || code
    }

    // Create tooltip content with enhanced styling
    const tooltipContent = `
      <div style="
        padding: 8px;
        min-width: 150px;
        background: white;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      ">
        <div style="
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e2e8f0;
        ">${regionName}</div>
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: #64748b;
        ">
          <span>Region Code:</span>
          <span style="
            background: #f1f5f9;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
          ">${code}</span>
        </div>
      </div>
    `

    // Set tooltip content
    if (typeof tooltip.html === 'function') {
      tooltip.html(tooltipContent)
    }
    else if (tooltip.innerHTML !== undefined) {
      tooltip.innerHTML = tooltipContent
    }
  },

  onMarkerSelected: (event: MouseEvent, code: string, isSelected: boolean, selectedMarkers: string[]): void => {
    console.warn('Marker selected:', code, isSelected, selectedMarkers)

    // Get the selected marker
    if (this._markers && code in this._markers) {
      const marker = this._markers[code]
      if (marker?.config?.name && isSelected && marker.config.coords) {
        const regionInfo = document.getElementById('region-info')
        if (regionInfo) {
          const cityInfo: { [key: string]: { description: string, color: string } } = {
            'Mexico City': {
              description: 'The capital and largest city of Mexico, known for its rich history and culture',
              color: '#10b981',
            },
            'Cancun': {
              description: 'Famous resort city known for its beaches and tourism',
              color: '#f59e0b',
            },
            'Guadalajara': {
              description: 'Second largest city in Mexico, known for mariachi music and tequila',
              color: '#ef4444',
            },
          }

          const info = cityInfo[marker.config.name] || {
            description: 'A notable location',
            color: '#4f46e5',
          }

          regionInfo.innerHTML = `
            <div style="padding: 12px; background: ${info.color}10; border-radius: 6px; border: 1px solid ${info.color}40;">
              <div style="font-weight: 600; color: ${info.color}; margin-bottom: 8px;">${marker.config.name}</div>
              <div style="color: #1e293b; font-size: 13px; margin-bottom: 4px;">
                ${info.description}
              </div>
              <div style="color: #64748b; font-size: 12px;">
                Location: ${marker.config.coords.join(', ')}
              </div>
            </div>
          `
        }
      }
    }
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

    // Create tooltip content with enhanced styling
    const tooltipContent = `
      <div style="
        padding: 8px;
        min-width: 150px;
        background: white;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      ">
        <div style="
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 8px;
          text-align: center;
        ">${markerName}</div>
        <div style="
          font-size: 12px;
          color: #64748b;
          text-align: center;
          padding-top: 4px;
          border-top: 1px solid #e2e8f0;
        ">
          <span>Marked Location</span>
        </div>
      </div>
    `

    // Set tooltip content
    if (typeof tooltip.html === 'function') {
      tooltip.html(tooltipContent)
    }
    else if (tooltip.innerHTML !== undefined) {
      tooltip.innerHTML = tooltipContent
    }
  },
})

// Make the map instance globally accessible
;(window as any)._map = map
