import type { MapOptions } from '../types'

const defaultOptions: MapOptions = {
  map: {
    name: 'world',
    projection: 'mercator',
  },
  backgroundColor: 'transparent',
  draggable: true,
  zoomButtons: true,
  zoomOnScroll: true,
  zoomOnScrollSpeed: 3,
  zoomMax: 12,
  zoomMin: 1,
  zoomAnimate: true,
  showTooltip: true,
  zoomStep: 1.5,
  bindTouchEvents: true,
  selector: '', // This will be set by the user

  // Line options
  lines: {
    style: {
      stroke: '#808080',
      strokeWidth: 1,
      strokeLinecap: 'round',
    },
    elements: [],
  },

  // Marker options
  markersSelectable: false,
  markersSelectableOne: false,
  markerStyle: {
    initial: {
      r: 7,
      fill: '#374151',
      fillOpacity: 1,
      stroke: '#FFF',
      strokeWidth: 5,
      strokeOpacity: 0.5,
    },
    hover: {
      fill: '#3cc0ff',
      cursor: 'pointer',
    },
    selected: {
      fill: 'blue',
    },
    selectedHover: {},
  },
  markerLabelStyle: {
    initial: {
      fontFamily: 'Verdana',
      fontSize: 12,
      fontWeight: 500,
      cursor: 'default',
      fill: '#374151',
    },
    hover: {
      cursor: 'pointer',
    },
    selected: {},
    selectedHover: {},
  },

  // Region options
  regionsSelectable: false,
  regionsSelectableOne: false,
  regionStyle: {
    initial: {
      fill: '#dee2e8',
      fillOpacity: 1,
      stroke: 'none',
      strokeWidth: 0,
    },
    hover: {
      fillOpacity: 0.7,
      cursor: 'pointer',
    },
    selected: {
      fill: '#9ca3af',
    },
    selectedHover: {},
  },
  regionLabelStyle: {
    initial: {
      fontFamily: 'Verdana',
      fontSize: '12',
      fontWeight: 'bold',
      cursor: 'default',
      fill: '#35373e',
    },
    hover: {
      cursor: 'pointer',
    },
  },
}

export default defaultOptions
