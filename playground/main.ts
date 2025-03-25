import type { MapData, MarkerConfig } from 'ts-maps'
import { VectorMap } from 'ts-maps'
// import world from '../packages/ts-maps/src/maps/world'
// Try using world-merc instead as it might have better projection
import worldMerc from '../packages/ts-maps/src/maps/world-merc'

// Register the map data
// VectorMap.addMap('world', world)
VectorMap.addMap('world_merc', worldMerc)

// Mock visitor data by country code
const visitorData: Record<string, number> = {
  US: 12500, // United States
  CA: 4800, // Canada
  GB: 7200, // United Kingdom
  DE: 5600, // Germany
  FR: 4900, // France
  ES: 3800, // Spain
  IT: 3500, // Italy
  JP: 2900, // Japan
  CN: 8700, // China
  IN: 6300, // India
  BR: 4200, // Brazil
  RU: 3800, // Russia
  AU: 2500, // Australia
  MX: 1900, // Mexico
  ZA: 1200, // South Africa
  EG: 950, // Egypt
  NG: 780, // Nigeria
  AR: 1500, // Argentina
  SE: 1800, // Sweden
  NO: 1400, // Norway
  FI: 1300, // Finland
  DK: 1250, // Denmark
  PL: 2100, // Poland
  TR: 1850, // Turkey
  SA: 1100, // Saudi Arabia
  AE: 890, // UAE
  TH: 1300, // Thailand
  SG: 780, // Singapore
  KR: 2200, // South Korea
  ID: 1700, // Indonesia
}

// Calculate color intensity based on visitor count
function getColorForVisitorCount(count: number): string {
  // If no visitors, return a light blue-gray color with more contrast
  if (count === 0) {
    return '#e2e8f0' // Slightly darker blue-gray for better contrast
  }

  // Find the max visitor count for normalization
  const maxVisitors = Math.max(...Object.values(visitorData))

  // Calculate intensity (0 to 1)
  const intensity = Math.max(0.2, Math.min(0.9, count / maxVisitors))

  // Create a more vibrant blue gradient from light to dark blue
  const r = Math.floor(120 - (80 * intensity))
  const g = Math.floor(150 - (100 * intensity))
  const b = Math.floor(240 - (40 * intensity))

  return `rgb(${r}, ${g}, ${b})`
}

// Generate region colors based on visitor data
const regionColors: Record<string, string> = {}
Object.entries(visitorData).forEach(([code, count]) => {
  regionColors[code] = getColorForVisitorCount(count)
})

const markers: MarkerConfig[] = []

// Function to apply visitor colors to regions
function applyVisitorColors(map: any): void {
  // First, set all regions to the default blue-gray color
  const defaultColor = '#e2e8f0' // Slightly darker blue-gray for better contrast

  // Get all regions
  const regions = map.regions as Record<string, any>

  // Apply the default color to all regions first
  Object.keys(regions).forEach((code) => {
    try {
      const region = regions[code]
      if (region && region.element) {
        // Apply default color directly to the SVG path element
        if (region.element.shape && region.element.shape.node) {
          // Set fill color directly on the SVG node
          region.element.shape.node.setAttribute('fill', defaultColor)
          region.element.shape.node.style.fill = defaultColor

          // Also update the style object
          if (region.element.shape.style && region.element.shape.style.initial) {
            region.element.shape.style.initial.fill = defaultColor
          }
        }

        // Also try to set it through the API if available
        if (typeof region.element.setStyle === 'function') {
          region.element.setStyle('fill', defaultColor)
        }
      }
    }
    catch (e) {
      console.error(`Error setting default color for ${code}:`, e)
    }
  })

  // Now apply custom colors based on visitor data
  Object.entries(regionColors).forEach(([code, color]) => {
    // Skip if there's no visitor data (keep the default color)
    if (!visitorData[code])
      return

    try {
      const region = regions[code]

      if (region && region.element) {
        // Apply color directly to the SVG path element
        if (region.element.shape && region.element.shape.node) {
          // Set fill color directly on the SVG node
          region.element.shape.node.setAttribute('fill', color)
          region.element.shape.node.style.fill = color

          // Also update the style object
          if (region.element.shape.style && region.element.shape.style.initial) {
            region.element.shape.style.initial.fill = color
          }
        }

        // Also try to set it through the API if available
        if (typeof region.element.setStyle === 'function') {
          region.element.setStyle('fill', color)
        }
      }
    }
    catch (e) {
      console.error(`Error setting color for ${code}:`, e)
    }
  })

  // Also update the default region style to ensure new regions get colored properly
  if (map.params.regionStyle.initial) {
    map.params.regionStyle.initial.fill = defaultColor
  }
}

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
      fill: '#e2e8f0', // Slightly darker blue-gray for better contrast
      stroke: '#cbd5e1', // Border color
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
  markerStyle: { initial: { fill: '#66F' } },

  // Event handling
  onLoaded(): void {
    //   // Apply custom colors based on visitor data
    applyVisitorColors(this)
    updateLegend()
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
    // Get map data
    const mapData = (_map as any)._mapData as MapData

    // Get region name from map data
    let regionName = code
    if (mapData.paths && typeof mapData.paths === 'object' && code in mapData.paths) {
      regionName = mapData.paths[code]?.name || code
    }

    // Get visitor count for this region
    const visitorCount = visitorData[code] || 0

    // Format visitor count with commas
    const formattedCount = visitorCount.toLocaleString()

    // Create tooltip content with improved styling
    let tooltipContent = `
      <div style="text-align: center;">
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">${regionName}</div>
    `

    if (visitorCount > 0) {
      tooltipContent += `
        <div style="font-size: 14px; color: #4f46e5; font-weight: 600; margin-bottom: 3px;">
          ${formattedCount} visitors
        </div>
      `
    }
    else {
      tooltipContent += `
        <div style="font-size: 13px; color: #94a3b8; margin-bottom: 3px;">
          No visitor data
        </div>
      `
    }

    // Add country code
    tooltipContent += `
        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
          Code: ${code}
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
    // eslint-disable-next-line no-console
    console.log('Marker selected:', event, code, isSelected, selectedMarkers)
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

    // Create tooltip content with improved styling
    const tooltipContent = `
      <div style="text-align: center;">
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">${markerName}</div>
        <div style="font-size: 13px; color: #4f46e5;">Important Location</div>
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

// Function to update the legend with visitor count information
function updateLegend(): void {
  const legendElement = document.querySelector('.map-legend')
  if (!legendElement)
    return

  // Find max visitor count
  const visitorCounts = Object.values(visitorData).filter(count => count > 0)
  const maxVisitors = Math.max(...visitorCounts)

  // Update the legend labels with formatted numbers
  const labels = legendElement.querySelector('.legend-labels')
  if (labels) {
    const spans = labels.querySelectorAll('span')
    if (spans.length >= 2) {
      spans[0].textContent = '0'
      spans[1].textContent = maxVisitors.toLocaleString()
    }
  }

  // Update the gradient to match our color function
  const gradient = legendElement.querySelector('.legend-gradient')
  if (gradient) {
    // Create a gradient that matches our color function
    const gradientStyle = 'background: linear-gradient(to right, #e2e8f0, rgb(40, 70, 200)); height: 20px; width: 100%; margin-bottom: 5px; border-radius: 3px;'
    gradient.setAttribute('style', gradientStyle)
  }

  // Update the legend title
  const title = legendElement.querySelector('h4')
  if (title) {
    title.textContent = 'Visitor Count'
  }
}
