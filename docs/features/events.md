# Events

ts-maps provides a rich set of events for interacting with your maps.

## Available Events

```typescript
// Region click events
map.params.onRegionClick = (event, code) => {
  console.log(`Clicked region: ${code}`)
}

// Region selection events
map.params.onRegionSelected = (event, code, isSelected, selectedRegions) => {
  console.log(`Region ${code} selection state: ${isSelected}`)
  console.log('Currently selected regions:', selectedRegions)
}

// Viewport events
map.params.onViewportChange = (scale, transX, transY) => {
  console.log(`Map viewport changed: scale=${scale}, x=${transX}, y=${transY}`)
}

// Load event
map.params.onLoaded = () => {
  console.log('Map has finished loading')
}
```

## Event Types

```typescript
interface MapEvents {
  onRegionClick?: (event: MouseEvent, code: string) => void
  onRegionSelected?: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => void
  onMarkerClick?: (event: MouseEvent, index: number) => void
  onViewportChange?: (scale: number, transX: number, transY: number) => void
  onLoaded?: () => void
}
```
