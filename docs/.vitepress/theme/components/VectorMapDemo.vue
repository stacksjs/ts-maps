<script setup lang="ts">
import type { MarkerConfig } from 'ts-maps'
import { VectorMap } from 'ts-maps'
import { onMounted, ref } from 'vue'
import world from '../../../../packages/ts-maps/src/maps/world-merc'

const mapContainer = ref<HTMLElement | null>(null)

onMounted(() => {
  if (mapContainer.value) {
    VectorMap.addMap('world', world)

    const _map = new VectorMap({
      selector: `#${mapContainer.value.id}`,
      map: {
        name: 'world',
        projection: 'mercator',
      },
      // Zoom configuration
      zoomOnScroll: true,
      zoomOnScrollSpeed: 1.5,
      zoomMax: 8,
      zoomMin: 1,
      zoomStep: 1.5,
      zoomAnimate: true,
      zoomButtons: true,

      // Region selection
      regionsSelectable: true,
      regionsSelectableOne: false,

      // General options
      draggable: true,
      bindTouchEvents: true,
      regionStyle: {
        initial: {
          fill: '#e4e4e4',
          stroke: '#ffffff',
          strokeWidth: 0.5,
        },
        hover: {
          fill: '#ccc',
        },
        selected: {
          fill: '#2ca25f',
        },
        selectedHover: {
          fill: '#1a9850',
        },
      },
      markers: [
        {
          coords: [-122.4194, 37.7749],
          name: 'San Francisco',
        },
      ],
      labels: {
        markers: {
          render: (marker: MarkerConfig) => marker.name,
          offsets: () => [0, 0],
        },
      },
      onLoaded: () => {
        console.log('map loaded')
      },
    })
  }
})
</script>

<template>
  <div class="workspace-wrapper">
    <div id="map" ref="mapContainer" class="vector-map-container" />
  </div>
</template>

<style>
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

  .workspace-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  /* Improved tooltip styling */
  .jvm-tooltip {
    background-color: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 500;
    color: #1e293b;
    pointer-events: none;
    border: 1px solid #e2e8f0;
    z-index: 1000;
    max-width: 250px;
    min-width: 120px;
    text-align: center;
    position: fixed !important; /* Use fixed positioning to ensure it stays in place */
    transition: none !important; /* Prevent any transitions */
    transform: translate3d(0,0,0) !important; /* Force hardware acceleration */
    will-change: top, left !important; /* Optimize for animations */
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
    background: white;
    border-right: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
  }

  /* Map legend */
  .map-legend {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background-color: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 12px;
    z-index: 100;
    border: 1px solid #e2e8f0;
    max-width: 200px;
  }

  .map-legend h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #1e293b;
  }

  .legend-gradient {
    height: 20px;
    width: 100%;
    margin-bottom: 5px;
    background: linear-gradient(to right, #e2e8f0, rgb(40, 70, 200));
    border-radius: 3px;
  }

  .legend-labels {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #64748b;
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

  /* Fix for the zoom buttons */
  #map .jvm-zoom-btn {
    position: absolute;
    right: 10px;
    z-index: 10;
    background-color: white;
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
  }

  #map .jvm-zoomin {
    top: 10px;
  }

  #map .jvm-zoomout {
    top: 50px;
  }

  #map .jvm-zoom-btn:hover {
    background-color: #f8fafc;
  }
</style>
