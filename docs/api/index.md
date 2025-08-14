# API Reference

This section provides detailed documentation for the ts-maps API.

## VectorMap Class

The main class for creating and managing vector maps.

### Constructor

```typescript
class VectorMap {
  constructor(options: MapOptions)
}
```

Creates a new vector map instance with the specified options.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `params` | `MapParams` | Current map parameters and settings |
| `container` | `HTMLElement` | The DOM element containing the map |
| `canvas` | `SVGElement` | The SVG element used for rendering |

### Methods

#### Map Control

| Method | Description |
|--------|-------------|
| `setFocus(scale?: number, centerLatLng?: [number, number])` | Sets the map focus to specified coordinates and zoom level |
| `setScale(scale: number)` | Sets the map zoom level |
| `getScale()` | Returns the current zoom level |
| `setCenter(lat: number, lng: number)` | Centers the map on specified coordinates |

#### Regions

| Method | Description |
|--------|-------------|
| `getSelectedRegions()` | Returns array of currently selected region codes |
| `clearSelectedRegions()` | Clears all selected regions |
| `setSelectedRegions(regions: string[])` | Sets the selected regions |
| `getRegionStyle(code: string)` | Gets the style for a specific region |

#### Markers

| Method | Description |
|--------|-------------|
| `addMarker(marker: Marker)` | Adds a single marker to the map |
| `addMarkers(markers: Marker[])` | Adds multiple markers to the map |
| `removeMarkers()` | Removes all markers from the map |
| `getSelectedMarkers()` | Returns array of currently selected marker indices |

#### Data Visualization

| Method | Description |
|--------|-------------|
| `setValues(values: Record<string, number>)` | Sets data values for regions |
| `clearValues()` | Clears all data values |
| `setScaleColors(colors: string[])` | Sets the color scale for data visualization |

## Types

### MapOptions

```typescript
interface MapOptions {
  selector: string
  map: {
    name: string
    projection: 'mercator' | 'miller'
  }
  backgroundColor?: string
  draggable?: boolean
  zoomButtons?: boolean
  zoomOnScroll?: boolean
  zoomOnScrollSpeed?: number
  zoomMax?: number
  zoomMin?: number
  zoomAnimate?: boolean
  showTooltip?: boolean
  zoomStep?: number
  bindTouchEvents?: boolean
  regionsSelectable?: boolean
  regionsSelectableOne?: boolean
  markersSelectable?: boolean
  markersSelectableOne?: boolean
  regionStyle?: RegionStyle
  markerStyle?: MarkerStyle
  visualizeData?: DataVisualizationOptions
}
```

### RegionStyle

```typescript
interface RegionStyle {
  initial?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    [key: string]: any
  }
  hover?: {
    fill?: string
    stroke?: string
    [key: string]: any
  }
  selected?: {
    fill?: string
    [key: string]: any
  }
  selectedHover?: {
    [key: string]: any
  }
}
```

### MarkerStyle

```typescript
interface MarkerStyle {
  initial?: {
    fill?: string
    stroke?: string
    r?: number
    [key: string]: any
  }
  hover?: {
    fill?: string
    stroke?: string
    r?: number
    [key: string]: any
  }
  selected?: {
    fill?: string
    [key: string]: any
  }
  selectedHover?: {
    [key: string]: any
  }
}
```

### DataVisualizationOptions

```typescript
interface DataVisualizationOptions {
  scale?: string[]
  values?: Record<string, number>
  normalizeFunction?: 'linear' | 'polynomial'
  min?: number
  max?: number
}
```

### Events

```typescript
interface MapEvents {
  onRegionClick?: (event: MouseEvent, code: string) => void
  onRegionSelected?: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => void
  onMarkerClick?: (event: MouseEvent, index: number) => void
  onViewportChange?: (scale: number, transX: number, transY: number) => void
  onLoaded?: () => void
}
```
