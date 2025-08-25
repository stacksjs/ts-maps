<script setup lang="ts">
import { VectorMap } from 'ts-maps'
import { onMounted, ref, watch } from 'vue'
import canada from '../../../../packages/ts-maps/src/maps/canada'
import usAea from '../../../../packages/ts-maps/src/maps/us-aea-en'
import usLcc from '../../../../packages/ts-maps/src/maps/us-lcc-en'
import usMerc from '../../../../packages/ts-maps/src/maps/us-merc-en'
import usMill from '../../../../packages/ts-maps/src/maps/us-mill-en'
import world from '../../../../packages/ts-maps/src/maps/world-merc'

const mapContainer = ref<HTMLElement | null>(null)
const currentMap = ref('world')
const mapInstance = ref<VectorMap | null>(null)

const mapOptions = [
  { value: 'world', label: 'Global Visitor Analytics', data: world, projection: 'mercator' as const },
  { value: 'us-merc', label: 'US States Visitors (Mercator)', data: usMerc, projection: 'mercator' as const },
  { value: 'us-mill', label: 'US States Visitors (Miller)', data: usMill, projection: 'miller' as const },
  { value: 'us-lcc', label: 'US States Visitors (Lambert)', data: usLcc, projection: 'mercator' as const },
  { value: 'us-aea', label: 'US States Visitors (Albers)', data: usAea, projection: 'mercator' as const },
  { value: 'canada', label: 'Canadian Provinces Visitors', data: canada, projection: 'mercator' as const },
]

// Global visitor analytics data with light blue to dark blue scale
const worldVisitorData = {
  scale: ['#e3f2fd', '#0d47a1'] as [string, string],
  values: {
    'US': 87,   // United States - High visitors
    'GB': 73,   // United Kingdom - Medium-high visitors
    'CA': 56,   // Canada - Medium visitors
    'DE': 91,   // Germany - Very high visitors
    'FR': 68,   // France - Medium-high visitors
    'AU': 42,   // Australia - Low-medium visitors
    'JP': 79,   // Japan - High visitors
    'BR': 35,   // Brazil - Low visitors
    'IN': 84,   // India - High visitors
    'CN': 29,   // China - Low visitors
    'IT': 61,   // Italy - Medium visitors
    'ES': 54,   // Spain - Medium visitors
    'NL': 76,   // Netherlands - High visitors
    'SE': 48,   // Sweden - Low-medium visitors
    'NO': 39,   // Norway - Low visitors
    'DK': 52,   // Denmark - Medium visitors
    'FI': 41,   // Finland - Low-medium visitors
    'CH': 78,   // Switzerland - High visitors
    'AT': 64,   // Austria - Medium visitors
    'BE': 71,   // Belgium - Medium-high visitors
    'IE': 59,   // Ireland - Medium visitors
    'NZ': 38,   // New Zealand - Low visitors
    'SG': 82,   // Singapore - High visitors
    'HK': 67,   // Hong Kong - Medium visitors
    'IL': 55,   // Israel - Medium visitors
    'SA': 31,   // Saudi Arabia - Low visitors
    'AE': 63,   // UAE - Medium visitors
    'TR': 46,   // Turkey - Low-medium visitors
    'PL': 49,   // Poland - Low-medium visitors
    'CZ': 57,   // Czech Republic - Medium visitors
    'HU': 44,   // Hungary - Low-medium visitors
    'RO': 36,   // Romania - Low visitors
    'BG': 33,   // Bulgaria - Low visitors
    'HR': 40,   // Croatia - Low-medium visitors
    'SI': 47,   // Slovenia - Low-medium visitors
    'SK': 41,   // Slovakia - Low-medium visitors
    'LT': 38,   // Lithuania - Low visitors
    'LV': 35,   // Latvia - Low visitors
    'EE': 42,   // Estonia - Low-medium visitors
    'LU': 74,   // Luxembourg - Medium-high visitors
    'MT': 28,   // Malta - Very low visitors
    'CY': 32,   // Cyprus - Low visitors
    'GR': 50,   // Greece - Medium visitors
    'PT': 45,   // Portugal - Low-medium visitors
    'MX': 53,   // Mexico - Medium visitors
    'KR': 72,   // South Korea - Medium-high visitors
    'TH': 58,   // Thailand - Medium visitors
    'MY': 51,   // Malaysia - Medium visitors
    'PH': 37,   // Philippines - Low visitors
    'ID': 34,   // Indonesia - Low visitors
    'VN': 30,   // Vietnam - Low visitors
    'TW': 65,   // Taiwan - Medium visitors
    'RU': 27,   // Russia - Low visitors
    // Alternative country codes
    'USA': 87,  // Alternative US code
    'UK': 73,   // Alternative GB code
    'GBR': 73,  // Alternative GB code
    'CHN': 29,  // Alternative CN code
    'IND': 84,  // Alternative IN code
    'BRA': 35,  // Alternative BR code
    'JPN': 79,  // Alternative JP code
    'AUS': 42,  // Alternative AU code
    'CAN': 56,  // Alternative CA code
    'MEX': 53,  // Alternative MX code
    'DEU': 91,  // Alternative DE code
    'FRA': 68,  // Alternative FR code
    'ITA': 61,  // Alternative IT code
    'ESP': 54,  // Alternative ES code
    'NLD': 76,  // Alternative NL code
    'SWE': 48,  // Alternative SE code
    'NOR': 39,  // Alternative NO code
    'DNK': 52,  // Alternative DK code
    'FIN': 41,  // Alternative FI code
    'CHE': 78,  // Alternative CH code
    'AUT': 64,  // Alternative AT code
    'BEL': 71,  // Alternative BE code
    'IRL': 59,  // Alternative IE code
    'NZL': 38,  // Alternative NZ code
    'SGP': 82,  // Alternative SG code
    'HKG': 67,  // Alternative HK code
    'ISR': 55,  // Alternative IL code
    'SAU': 31,  // Alternative SA code
    'ARE': 63,  // Alternative AE code
    'TUR': 46,  // Alternative TR code
    'POL': 49,  // Alternative PL code
    'CZE': 57,  // Alternative CZ code
    'HUN': 44,  // Alternative HU code
    'ROU': 36,  // Alternative RO code
    'BGR': 33,  // Alternative BG code
    'HRV': 40,  // Alternative HR code
    'SVN': 47,  // Alternative SI code
    'SVK': 41,  // Alternative SK code
    'LTU': 38,  // Alternative LT code
    'LVA': 35,  // Alternative LV code
    'EST': 42,  // Alternative EE code
    'LUX': 74,  // Alternative LU code
    'MLT': 28,  // Alternative MT code
    'CYP': 32,  // Alternative CY code
    'GRC': 50,  // Alternative GR code
    'PRT': 45,  // Alternative PT code
  },
}

// US States visitor analytics data
const usVisitorData = {
  scale: ['#e3f2fd', '#0d47a1'] as [string, string],
  values: {
    CA: 89, // California - Very high visitors
    TX: 76, // Texas - High visitors
    NY: 94, // New York - Highest visitors
    FL: 82, // Florida - High visitors
    WA: 58, // Washington - Medium visitors
    IL: 71, // Illinois - Medium-high visitors
    PA: 63, // Pennsylvania - Medium visitors
    OH: 45, // Ohio - Low-medium visitors
    GA: 67, // Georgia - Medium-high visitors
    NC: 52, // North Carolina - Medium visitors
    MI: 38, // Michigan - Low visitors
    VA: 59, // Virginia - Medium visitors
    CO: 73, // Colorado - Medium-high visitors
    AZ: 49, // Arizona - Low-medium visitors
    OR: 66, // Oregon - Medium visitors
    TN: 54, // Tennessee - Medium visitors
    MO: 41, // Missouri - Low-medium visitors
    IN: 47, // Indiana - Low-medium visitors
    MN: 62, // Minnesota - Medium visitors
    WI: 55, // Wisconsin - Medium visitors
    MD: 68, // Maryland - Medium-high visitors
    LA: 43, // Louisiana - Low-medium visitors
    AL: 37, // Alabama - Low visitors
    KY: 40, // Kentucky - Low-medium visitors
    SC: 51, // South Carolina - Medium visitors
    OK: 39, // Oklahoma - Low visitors
    IA: 46, // Iowa - Low-medium visitors
    AR: 35, // Arkansas - Low visitors
    MS: 32, // Mississippi - Low visitors
    KS: 42, // Kansas - Low-medium visitors
    NE: 44, // Nebraska - Low-medium visitors
    ID: 33, // Idaho - Low visitors
    NV: 60, // Nevada - Medium visitors
    UT: 53, // Utah - Medium visitors
    NM: 36, // New Mexico - Low visitors
    ND: 29, // North Dakota - Very low visitors
    SD: 31, // South Dakota - Low visitors
    MT: 34, // Montana - Low visitors
    WY: 28, // Wyoming - Very low visitors
    AK: 26, // Alaska - Very low visitors
    HI: 48, // Hawaii - Low-medium visitors
    VT: 38, // Vermont - Low visitors
    NH: 41, // New Hampshire - Low-medium visitors
    ME: 35, // Maine - Low visitors
    RI: 50, // Rhode Island - Medium visitors
    CT: 65, // Connecticut - Medium visitors
    NJ: 74, // New Jersey - Medium-high visitors
    DE: 56, // Delaware - Medium visitors
  },
}

// Canadian provinces visitor analytics data
const canadaVisitorData = {
  scale: ['#e3f2fd', '#0d47a1'] as [string, string],
  values: {
    ON: 88, // Ontario - Very high visitors
    QC: 74, // Quebec - High visitors
    BC: 81, // British Columbia - High visitors
    AB: 69, // Alberta - Medium-high visitors
    MB: 43, // Manitoba - Low-medium visitors
    SK: 37, // Saskatchewan - Low visitors
    NS: 51, // Nova Scotia - Medium visitors
    NB: 46, // New Brunswick - Low-medium visitors
    NL: 33, // Newfoundland and Labrador - Low visitors
    PE: 28, // Prince Edward Island - Very low visitors
    NT: 24, // Northwest Territories - Very low visitors
    NU: 18, // Nunavut - Very low visitors
    YT: 31, // Yukon - Low visitors
  },
}

function getMapData(mapType: string) {
  if (mapType.startsWith('us'))
    return usVisitorData
  if (mapType === 'canada')
    return canadaVisitorData
  return worldVisitorData
}

function getMapProjection(mapType: string) {
  const option = mapOptions.find(opt => opt.value === mapType)
  return option?.projection || 'mercator'
}

function getAnalyticsDescription(mapType: string) {
  if (mapType.startsWith('us'))
    return 'US States Visitor Analytics - Shows visitor distribution across US states with New York leading at 94% and Wyoming lowest at 28%'
  if (mapType === 'canada')
    return 'Canadian Provinces Visitor Analytics - Displays visitor patterns across Canadian provinces with Ontario leading at 88%'
  return 'Global Visitor Analytics - Worldwide visitor distribution with Germany leading at 91% and Nunavut lowest at 18%'
}

function initializeMap() {
  if (!mapContainer.value)
    return

  const selectedOption = mapOptions.find(opt => opt.value === currentMap.value)
  if (!selectedOption)
    return

  // Clear previous map
  if (mapInstance.value) {
    mapInstance.value = null
  }

  // Add the selected map
  VectorMap.addMap(currentMap.value, selectedOption.data)

  // Get the visitor data for the current map
  const mapData = getMapData(currentMap.value)
  console.log('Visitor analytics data:', mapData)
  console.log('Current map:', currentMap.value)

  // Create new map instance with visitor analytics heatmap configuration
  mapInstance.value = new VectorMap({
    selector: `#${mapContainer.value.id}`,
    map: {
      name: currentMap.value,
      projection: getMapProjection(currentMap.value),
    },
    visualizeData: mapData,
    backgroundColor: '#f8fafc',
    zoomOnScroll: true,
    zoomButtons: true,
    regionsSelectable: true,
    regionStyle: {
      initial: {
        fill: '#e2e8f0',
        stroke: '#ffffff',
        'stroke-width': 0.5,
        'stroke-opacity': 1,
      },
      hover: {
        fill: '#cbd5e1',
        'fill-opacity': 0.8,
        cursor: 'pointer',
      },
      selected: {
        fill: '#3b82f6',
        'fill-opacity': 0.8,
      },
    },
  })

  console.log('Visitor analytics map instance created:', mapInstance.value)
  
  // Try to apply data after a short delay to ensure map is loaded
  setTimeout(() => {
    if (mapInstance.value) {
      console.log('Attempting to reapply visitor data after delay')
      console.log('Map state after delay:', mapInstance.value)
    }
  }, 1000)
}

function changeMap(newMap: string) {
  currentMap.value = newMap
}

onMounted(() => {
  initializeMap()
})

watch(currentMap, () => {
  initializeMap()
})
</script>

<template>
  <div class="analytics-workspace">
    <div class="analytics-controls">
      <label for="map-select">Select Analytics View:</label>
      <select id="map-select" v-model="currentMap" @change="changeMap(($event.target as HTMLSelectElement).value)">
        <option v-for="option in mapOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div id="map" ref="mapContainer" class="analytics-map-container" />

    <div class="analytics-info">
      <h4>{{ mapOptions.find(opt => opt.value === currentMap)?.label }}</h4>
      <p><strong>Projection:</strong> {{ getMapProjection(currentMap) }}</p>
      <p><strong>Description:</strong> {{ getAnalyticsDescription(currentMap) }}</p>
      
      <div class="visitor-legend">
        <h5>Visitor Analytics Legend</h5>
        <div class="legend-gradient-blue"></div>
        <div class="legend-labels">
          <span>Low Visitors (0-30%)</span>
          <span>High Visitors (70-100%)</span>
        </div>
        <p class="legend-description">
          Blue intensity represents visitor volume: Light blue indicates minimal visitors, while dark blue shows peak visitor activity
        </p>
      </div>

      <div class="analytics-metrics">
        <h5>Key Analytics Insights</h5>
        <div class="metrics-grid">
          <div class="metric-card" v-if="currentMap === 'world'">
            <span class="metric-label">Top Performer</span>
            <span class="metric-value">Germany (91%)</span>
          </div>
          <div class="metric-card" v-if="currentMap.startsWith('us')">
            <span class="metric-label">Top Performer</span>
            <span class="metric-value">New York (94%)</span>
          </div>
          <div class="metric-card" v-if="currentMap === 'canada'">
            <span class="metric-label">Top Performer</span>
            <span class="metric-value">Ontario (88%)</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Data Points</span>
            <span class="metric-value">{{ Object.keys(getMapData(currentMap).values).length }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Color Scale</span>
            <span class="metric-value">10-step Green</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .analytics-workspace {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  .analytics-controls {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .analytics-controls label {
    font-weight: 600;
    color: #374151;
    font-size: 14px;
  }

  .analytics-controls select {
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background-color: white;
    font-size: 14px;
    min-width: 280px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition: border-color 0.2s;
  }

  .analytics-controls select:focus {
    outline: none;
    border-color: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
  }

  .analytics-info {
    margin-top: 24px;
    padding: 20px;
    background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .analytics-info h4 {
    margin: 0 0 12px 0;
    color: #111827;
    font-size: 18px;
    font-weight: 700;
  }

  .analytics-info p {
    margin: 6px 0;
    color: #6b7280;
    font-size: 14px;
    line-height: 1.5;
  }

  .visitor-legend {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  }

  .visitor-legend h5 {
    margin: 0 0 16px 0;
    color: #111827;
    font-size: 15px;
    font-weight: 600;
  }

  .legend-gradient-blue {
    height: 24px;
    width: 100%;
    margin-bottom: 10px;
    border-radius: 6px;
    background: linear-gradient(to right, #e3f2fd, #bbdefb, #90caf9, #64b5f6, #42a5f5, #2196f3, #1e88e5, #1976d2, #1565c0, #0d47a1);
    border: 1px solid #e5e7eb;
  }

  .legend-labels {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #64748b;
    margin-bottom: 10px;
    font-weight: 500;
  }

  .legend-description {
    font-size: 12px;
    color: #6b7280;
    margin: 0;
    line-height: 1.5;
    font-style: italic;
  }

  .analytics-metrics {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  }

  .analytics-metrics h5 {
    margin: 0 0 16px 0;
    color: #111827;
    font-size: 15px;
    font-weight: 600;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }

  .metric-card {
    background: white;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .metric-label {
    font-size: 11px;
    color: #9ca3af;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .metric-value {
    font-size: 14px;
    color: #10b981;
    font-weight: 700;
  }

  #map {
    width: 100%;
    height: 600px;
    margin: 0 auto;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    background-color: #f1f5f9;
    position: relative;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  }

  /* Ensure SVG fills the container */
  #map svg {
    width: 100% !important;
    height: 100% !important;
    position: absolute;
    top: 0;
    left: 0;
  }

  /* Hide all text elements on the map */
  #map .jvm-region-label {
    display: none !important;
  }

  /* Fix for the zoom buttons */
  #map .jvm-zoom-btn {
    position: absolute;
    right: 10px;
    z-index: 10;
  }

  #map .jvm-zoomin {
    top: 10px;
  }

  #map .jvm-zoomout {
    top: 50px;
  }

  /* Enhanced tooltip styling for visitor analytics */
  .jvm-tooltip {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    padding: 14px 18px;
    font-size: 14px;
    font-weight: 600;
    color: white;
    pointer-events: none;
    border: none;
    z-index: 1000;
    max-width: 280px;
    min-width: 140px;
    text-align: center;
    position: fixed !important;
    transition: none !important;
    transform: translate3d(0,0,0) !important;
    will-change: top, left !important;
  }

  /* Tooltip arrow */
  .jvm-tooltip:after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 16px;
    height: 16px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: none;
  }

  /* Map control buttons styling for analytics */
  .jvm-zoom-btn {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(249, 250, 251, 0.95) 100%);
    border: 1px solid #10b981;
    color: #10b981;
    width: 36px;
    height: 36px;
    border-radius: 6px;
    line-height: 36px;
    text-align: center;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
    backdrop-filter: blur(12px);
    transition: all 0.2s;
  }

  .jvm-zoom-btn:hover {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    transform: scale(1.05);
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .analytics-workspace {
      padding: 16px;
    }
    
    .analytics-controls {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
    
    .analytics-controls select {
      min-width: 100%;
    }
    
    #map {
      height: 400px;
    }
    
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>