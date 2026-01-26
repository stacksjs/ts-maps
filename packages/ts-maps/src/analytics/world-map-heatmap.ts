/**
 * WorldMapHeatmap - Analytics-optimized world map component
 *
 * A specialized component for visualizing visitor data by country
 * with automatic color scaling based on visitor counts.
 */

import { VectorMap } from '../vector-map'
import type { MapOptions, DataVisualizationOptions } from '../types'

export interface CountryData {
  country: string // Country name or ISO code
  visitors: number
  [key: string]: any
}

export interface WorldMapHeatmapOptions {
  selector: string
  data: CountryData[]
  colorScale?: [string, string] // [min color, max color]
  backgroundColor?: string
  showTooltip?: boolean
  zoomOnScroll?: boolean
  draggable?: boolean
  onCountryClick?: (event: MouseEvent, code: string, data?: CountryData) => void
  onCountryHover?: (event: MouseEvent, tooltip: HTMLElement, code: string, data?: CountryData) => void
  theme?: 'light' | 'dark'
}

// Map common country names to ISO 2-letter codes
const countryNameToCode: Record<string, string> = {
  'United States': 'US',
  'USA': 'US',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'Great Britain': 'GB',
  'Germany': 'DE',
  'France': 'FR',
  'Canada': 'CA',
  'Australia': 'AU',
  'Japan': 'JP',
  'China': 'CN',
  'India': 'IN',
  'Brazil': 'BR',
  'Mexico': 'MX',
  'Spain': 'ES',
  'Italy': 'IT',
  'Netherlands': 'NL',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Poland': 'PL',
  'Russia': 'RU',
  'South Korea': 'KR',
  'Korea': 'KR',
  'Taiwan': 'TW',
  'Singapore': 'SG',
  'Indonesia': 'ID',
  'Thailand': 'TH',
  'Vietnam': 'VN',
  'Philippines': 'PH',
  'Malaysia': 'MY',
  'New Zealand': 'NZ',
  'Ireland': 'IE',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Belgium': 'BE',
  'Portugal': 'PT',
  'Greece': 'GR',
  'Czech Republic': 'CZ',
  'Czechia': 'CZ',
  'Romania': 'RO',
  'Hungary': 'HU',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Colombia': 'CO',
  'Peru': 'PE',
  'Venezuela': 'VE',
  'South Africa': 'ZA',
  'Egypt': 'EG',
  'Nigeria': 'NG',
  'Kenya': 'KE',
  'Morocco': 'MA',
  'Israel': 'IL',
  'Turkey': 'TR',
  'Saudi Arabia': 'SA',
  'UAE': 'AE',
  'United Arab Emirates': 'AE',
  'Pakistan': 'PK',
  'Bangladesh': 'BD',
  'Ukraine': 'UA',
  'Belarus': 'BY',
  'Slovakia': 'SK',
  'Slovenia': 'SI',
  'Croatia': 'HR',
  'Serbia': 'RS',
  'Bulgaria': 'BG',
  'Lithuania': 'LT',
  'Latvia': 'LV',
  'Estonia': 'EE',
  'Iceland': 'IS',
  'Luxembourg': 'LU',
  'Malta': 'MT',
  'Cyprus': 'CY',
  'Hong Kong': 'HK',
  'Macau': 'MO',
  'Unknown': '',
}

// Reverse mapping for tooltips
const codeToCountryName: Record<string, string> = {}
Object.entries(countryNameToCode).forEach(([name, code]) => {
  if (code && !codeToCountryName[code]) {
    codeToCountryName[code] = name
  }
})

export function getCountryCode(country: string): string {
  // If already a 2-letter code, return it uppercase
  if (country.length === 2) {
    return country.toUpperCase()
  }
  // Look up by name
  return countryNameToCode[country] || ''
}

export function getCountryName(code: string): string {
  return codeToCountryName[code.toUpperCase()] || code
}

export class WorldMapHeatmap {
  private map: any
  private options: WorldMapHeatmapOptions
  private dataByCode: Map<string, CountryData> = new Map()

  constructor(options: WorldMapHeatmapOptions) {
    this.options = options
    this.processData()
    this.initMap()
  }

  private processData(): void {
    this.dataByCode.clear()
    for (const item of this.options.data) {
      const code = getCountryCode(item.country)
      if (code) {
        this.dataByCode.set(code, item)
      }
    }
  }

  private initMap(): void {
    const { selector, colorScale, backgroundColor, showTooltip, zoomOnScroll, draggable, theme } = this.options

    // Build values object for visualization
    const values: Record<string, number> = {}
    this.dataByCode.forEach((data, code) => {
      values[code] = data.visitors
    })

    // Default colors based on theme
    const isDark = theme === 'dark' || theme === undefined
    const defaultScale: [string, string] = isDark
      ? ['#1e293b', '#6366f1'] // Dark theme: slate to indigo
      : ['#e2e8f0', '#4f46e5'] // Light theme: slate-200 to indigo-600

    const defaultBg = isDark ? '#0f1117' : '#f8fafc'
    const regionInitialFill = isDark ? '#1e293b' : '#cbd5e1'
    const regionHoverFill = isDark ? '#334155' : '#94a3b8'
    const borderColor = isDark ? '#334155' : '#94a3b8'

    const mapOptions: MapOptions = {
      selector,
      map: {
        name: 'world',
        projection: 'mercator',
      },
      backgroundColor: backgroundColor || defaultBg,
      showTooltip: showTooltip !== false,
      zoomOnScroll: zoomOnScroll !== false,
      draggable: draggable !== false,
      zoomButtons: false,
      regionStyle: {
        initial: {
          fill: regionInitialFill,
          stroke: borderColor,
          strokeWidth: 0.5,
        },
        hover: {
          fill: regionHoverFill,
          strokeWidth: 1,
        },
      },
      visualizeData: {
        scale: colorScale || defaultScale,
        values,
      },
      onRegionClick: (event: MouseEvent, code: string) => {
        if (this.options.onCountryClick) {
          this.options.onCountryClick(event, code, this.dataByCode.get(code))
        }
      },
      onRegionTooltipShow: (event: MouseEvent, tooltip: HTMLElement, code: string) => {
        const data = this.dataByCode.get(code)
        const countryName = getCountryName(code)
        const visitors = data?.visitors || 0

        tooltip.innerHTML = `
          <div style="font-weight: 600; margin-bottom: 4px;">${countryName}</div>
          <div style="color: ${isDark ? '#9ca3af' : '#64748b'};">${visitors.toLocaleString()} visitor${visitors !== 1 ? 's' : ''}</div>
        `

        if (this.options.onCountryHover) {
          this.options.onCountryHover(event, tooltip, code, data)
        }
      },
    }

    this.map = new VectorMap(mapOptions)
  }

  /**
   * Update the map with new data
   */
  updateData(data: CountryData[]): void {
    this.options.data = data
    this.processData()

    const values: Record<string, number> = {}
    this.dataByCode.forEach((d, code) => {
      values[code] = d.visitors
    })

    // Update visualization if map supports it
    if (this.map && this.map.series && this.map.series.regions && this.map.series.regions[0]) {
      this.map.series.regions[0].setValues(values)
    }
  }

  /**
   * Get the underlying VectorMap instance
   */
  getMap(): any {
    return this.map
  }

  /**
   * Destroy the map
   */
  destroy(): void {
    if (this.map && typeof this.map.destroy === 'function') {
      this.map.destroy()
    }
  }
}

export default WorldMapHeatmap
