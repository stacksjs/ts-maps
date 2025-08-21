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
  { value: 'world', label: 'World Map', data: world, projection: 'mercator' as const },
  { value: 'us-merc', label: 'United States (Mercator)', data: usMerc, projection: 'mercator' as const },
  { value: 'us-mill', label: 'United States (Miller)', data: usMill, projection: 'miller' as const },
  { value: 'us-lcc', label: 'United States (Lambert)', data: usLcc, projection: 'mercator' as const },
  { value: 'us-aea', label: 'United States (Albers)', data: usAea, projection: 'mercator' as const },
  { value: 'canada', label: 'Canada', data: canada, projection: 'mercator' as const },
]

// Heatmap data with more realistic values and better color scales
const worldHeatmapData = {
  scale: ['#ffffff', '#c62828'] as [string, string],
  values: {
    'US': 95,   // High activity
    'CN': 88,   // High activity
    'RU': 72,   // Medium-high
    'BR': 65,   // Medium
    'IN': 58,   // Medium
    'DE': 82,   // High activity
    'FR': 78,   // High activity
    'GB': 85,   // High activity
    'JP': 68,   // Medium
    'CA': 75,   // Medium-high
    'AU': 62,   // Medium
    'MX': 55,   // Medium-low
    'KR': 70,   // Medium-high
    'IT': 73,   // Medium-high
    'ES': 66,   // Medium
    'NL': 80,   // High activity
    'SE': 58,   // Medium
    'NO': 45,   // Medium-low
    'DK': 52,   // Medium-low
    'FI': 48,   // Medium-low
    'CH': 76,   // Medium-high
    'AT': 64,   // Medium
    'BE': 71,   // Medium-high
    'IE': 69,   // Medium-high
    'NZ': 42,   // Low-medium
    'SG': 74,   // Medium-high
    'HK': 67,   // Medium
    'IL': 63,   // Medium
    'SA': 56,   // Medium-low
    'AE': 61,   // Medium
    'TR': 59,   // Medium
    'PL': 54,   // Medium-low
    'CZ': 57,   // Medium
    'HU': 51,   // Medium-low
    'RO': 43,   // Low-medium
    'BG': 39,   // Low
    'HR': 46,   // Medium-low
    'SI': 49,   // Medium-low
    'SK': 44,   // Low-medium
    'LT': 41,   // Low-medium
    'LV': 38,   // Low
    'EE': 40,   // Low-medium
    'LU': 72,   // Medium-high
    'MT': 35,   // Low
    'CY': 37,   // Low
    'GR': 53,   // Medium-low
    'PT': 50,   // Medium-low
    // Add more countries with lower values to create better contrast
    'AR': 33,   // Argentina - Low
    'CL': 31,   // Chile - Low
    'PE': 29,   // Peru - Low
    'CO': 27,   // Colombia - Low
    'VE': 25,   // Venezuela - Low
    'EC': 23,   // Ecuador - Low
    'BO': 21,   // Bolivia - Low
    'PY': 19,   // Paraguay - Low
    'UY': 17,   // Uruguay - Low
    'GY': 15,   // Guyana - Low
    'SR': 13,   // Suriname - Low
    'FK': 11,   // Falkland Islands - Very low
    'ZA': 37,   // South Africa - Low
    'NG': 35,   // Nigeria - Low
    'EG': 33,   // Egypt - Low
    'DZ': 31,   // Algeria - Low
    'LY': 29,   // Libya - Low
    'SD': 27,   // Sudan - Low
    'TD': 25,   // Chad - Low
    'NE': 23,   // Niger - Low
    'ML': 21,   // Mali - Low
    'BF': 19,   // Burkina Faso - Low
    'CI': 17,   // Ivory Coast - Low
    'GH': 15,   // Ghana - Low
    'CM': 13,   // Cameroon - Low
    'CF': 11,   // Central African Republic - Very low
    'CG': 9,    // Republic of Congo - Very low
    'CD': 7,    // Democratic Republic of Congo - Very low
    'AO': 5,    // Angola - Very low
    'ZM': 3,    // Zambia - Very low
    'ZW': 1,    // Zimbabwe - Very low
    // Add some common alternative country codes
    'USA': 95,  // Alternative US code
    'UK': 85,   // Alternative GB code
    'RUS': 72,  // Alternative RU code
    'CHN': 88,  // Alternative CN code
    'IND': 58,  // Alternative IN code
    'BRA': 65,  // Alternative BR code
    'JPN': 68,  // Alternative JP code
    'AUS': 62,  // Alternative AU code
    'CAN': 75,  // Alternative CA code
    'MEX': 55,  // Alternative MX code
    'DEU': 82,  // Alternative DE code
    'FRA': 78,  // Alternative FR code
    'ITA': 73,  // Alternative IT code
    'ESP': 66,  // Alternative ES code
    'NLD': 80,  // Alternative NL code
    'SWE': 58,  // Alternative SE code
    'NOR': 45,  // Alternative NO code
    'DNK': 52,  // Alternative DK code
    'FIN': 48,  // Alternative FI code
    'CHE': 76,  // Alternative CH code
    'AUT': 64,  // Alternative AT code
    'BEL': 71,  // Alternative BE code
    'IRL': 69,  // Alternative IE code
    'NZL': 42,  // Alternative NZ code
    'SGP': 74,  // Alternative SG code
    'HKG': 67,  // Alternative HK code
    'ISR': 63,  // Alternative IL code
    'SAU': 56,  // Alternative SA code
    'ARE': 61,  // Alternative AE code
    'TUR': 59,  // Alternative TR code
    'POL': 54,  // Alternative PL code
    'CZE': 57,  // Alternative CZ code
    'HUN': 51,  // Alternative HU code
    'ROU': 43,  // Alternative RO code
    'BGR': 39,  // Alternative BG code
    'HRV': 46,  // Alternative HR code
    'SVN': 49,  // Alternative SI code
    'SVK': 44,  // Alternative SK code
    'LTU': 41,  // Alternative LT code
    'LVA': 38,  // Alternative LV code
    'EST': 40,  // Alternative EE code
    'LUX': 72,  // Alternative LU code
    'MLT': 35,  // Alternative MT code
    'CYP': 37,  // Alternative CY code
    'GRC': 53,  // Alternative GR code
    'PRT': 50,  // Alternative PT code
  },
}

const usHeatmapData = {
  scale: ['#ffffff', '#1565c0'] as [string, string],
  values: {
    CA: 95, // California - Very high
    TX: 88, // Texas - Very high
    NY: 92, // New York - Very high
    FL: 85, // Florida - High
    IL: 78, // Illinois - High
    PA: 72, // Pennsylvania - Medium-high
    OH: 68, // Ohio - Medium-high
    GA: 75, // Georgia - High
    NC: 70, // North Carolina - Medium-high
    MI: 65, // Michigan - Medium
    VA: 73, // Virginia - High
    WA: 80, // Washington - High
    OR: 67, // Oregon - Medium
    AZ: 71, // Arizona - Medium-high
    CO: 76, // Colorado - High
    TN: 62, // Tennessee - Medium
    MO: 58, // Missouri - Medium-low
    IN: 64, // Indiana - Medium
    MN: 69, // Minnesota - Medium-high
    WI: 66, // Wisconsin - Medium
    MD: 74, // Maryland - High
    LA: 61, // Louisiana - Medium
    AL: 55, // Alabama - Medium-low
    KY: 59, // Kentucky - Medium-low
    SC: 63, // South Carolina - Medium
    OK: 57, // Oklahoma - Medium-low
    IA: 60, // Iowa - Medium
    AR: 54, // Arkansas - Medium-low
    MS: 48, // Mississippi - Low-medium
    KS: 56, // Kansas - Medium-low
    NE: 52, // Nebraska - Medium-low
    ID: 45, // Idaho - Low-medium
    NV: 68, // Nevada - Medium-high
    UT: 62, // Utah - Medium
    NM: 51, // New Mexico - Medium-low
    ND: 38, // North Dakota - Low
    SD: 41, // South Dakota - Low-medium
    MT: 43, // Montana - Low-medium
    WY: 39, // Wyoming - Low
    AK: 35, // Alaska - Low
    HI: 58, // Hawaii - Medium-low
    VT: 42, // Vermont - Low-medium
    NH: 44, // New Hampshire - Low-medium
    ME: 40, // Maine - Low-medium
    RI: 53, // Rhode Island - Medium-low
    CT: 71, // Connecticut - Medium-high
    NJ: 79, // New Jersey - High
    DE: 66, // Delaware - Medium
  },
}

const canadaHeatmapData = {
  scale: ['#ffffff', '#ef6c00'] as [string, string],
  values: {
    ON: 92, // Ontario - Very high
    QC: 88, // Quebec - Very high
    BC: 85, // British Columbia - High
    AB: 82, // Alberta - High
    MB: 65, // Manitoba - Medium
    SK: 58, // Saskatchewan - Medium-low
    NS: 62, // Nova Scotia - Medium
    NB: 55, // New Brunswick - Medium-low
    NL: 48, // Newfoundland and Labrador - Low-medium
    PE: 42, // Prince Edward Island - Low-medium
    NT: 35, // Northwest Territories - Low
    NU: 28, // Nunavut - Very low
    YT: 38, // Yukon - Low-medium
  },
}

function getMapData(mapType: string) {
  if (mapType.startsWith('us'))
    return usHeatmapData
  if (mapType === 'canada')
    return canadaHeatmapData
  return worldHeatmapData
}

function getMapProjection(mapType: string) {
  const option = mapOptions.find(opt => opt.value === mapType)
  return option?.projection || 'mercator'
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

  // Get the data for the current map
  const mapData = getMapData(currentMap.value)
  console.log('Map data:', mapData)
  console.log('Current map:', currentMap.value)

  // Create new map instance with heatmap configuration
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

  console.log('Map instance created:', mapInstance.value)
  
  // Try to apply data after a short delay to ensure map is loaded
  setTimeout(() => {
    if (mapInstance.value) {
      console.log('Attempting to reapply data after delay')
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
  <div class="workspace-wrapper">
    <div class="map-controls">
      <label for="map-select">Select Map:</label>
      <select id="map-select" v-model="currentMap" @change="changeMap(($event.target as HTMLSelectElement).value)">
        <option v-for="option in mapOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div id="map" ref="mapContainer" class="vector-map-container" />

    <div class="map-info">
      <h4>Current Map: {{ mapOptions.find(opt => opt.value === currentMap)?.label }}</h4>
      <p>Projection: {{ getMapProjection(currentMap) }}</p>
      <p>
        Data: {{
          currentMap.startsWith('us') ? 'US States Heatmap'
          : currentMap === 'canada' ? 'Canadian Provinces & Territories Heatmap'
            : 'World Countries Heatmap'
        }}
      </p>
      <div class="heatmap-legend">
        <h5>Heatmap Legend</h5>
        <div class="legend-gradient"></div>
        <div class="legend-labels">
          <span>Low</span>
          <span>High</span>
        </div>
        <p class="legend-description">
          Colors represent activity levels: White (0-10%) to Dark Red/Blue/Orange (90-100%)
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .map-controls {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .map-controls label {
    font-weight: 500;
    color: #374151;
  }

  .map-controls select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background-color: white;
    font-size: 14px;
    min-width: 250px;
  }

  .map-info {
    margin-top: 20px;
    padding: 16px;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .map-info h4 {
    margin: 0 0 8px 0;
    color: #111827;
    font-size: 16px;
  }

  .map-info p {
    margin: 4px 0;
    color: #6b7280;
    font-size: 14px;
  }

  .heatmap-legend {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .heatmap-legend h5 {
    margin: 0 0 12px 0;
    color: #111827;
    font-size: 14px;
    font-weight: 600;
  }

  .legend-gradient {
    height: 20px;
    width: 100%;
    margin-bottom: 8px;
    border-radius: 4px;
    background: linear-gradient(to right, #ffffff, #ffebee, #ffcdd2, #ef9a9a, #e57373, #ef5350, #f44336, #e53935, #d32f2f, #c62828);
  }

  .legend-labels {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #64748b;
    margin-bottom: 8px;
  }

  .legend-description {
    font-size: 12px;
    color: #6b7280;
    margin: 0;
    line-height: 1.4;
  }

  #map {
    width: 100%;
    height: 600px;
    margin: 0 auto;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    background-color: #f1f5f9;
    position: relative;
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

  .workspace-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  /* Improved tooltip styling for heatmap */
  .jvm-tooltip {
    background-color: rgba(0, 0, 0, 0.9);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 500;
    color: white;
    pointer-events: none;
    border: none;
    z-index: 1000;
    max-width: 250px;
    min-width: 120px;
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
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 12px;
    height: 12px;
    background: rgba(0, 0, 0, 0.9);
    border: none;
  }

  /* Map legend */
  .map-legend {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background-color: rgba(255, 255, 255, 0.95);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 12px;
    z-index: 100;
    border: 1px solid #e2e8f0;
    max-width: 200px;
    backdrop-filter: blur(10px);
  }

  .map-legend h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #1e293b;
  }

  /* Map control buttons styling */
  .jvm-zoom-btn {
    background-color: rgba(255, 255, 255, 0.9);
    border: 1px solid #e2e8f0;
    color: #4f46e5;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    line-height: 30px;
    text-align: center;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    backdrop-filter: blur(10px);
  }

  .jvm-zoom-btn:hover {
    background-color: rgba(255, 255, 255, 1);
  }
</style>
