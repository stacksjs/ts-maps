# React Components

ts-maps provides official React components that make it easy to integrate interactive vector maps into your React applications.

## Installation

Install the React package:

```bash
npm install ts-maps ts-maps-react
```

## Setup

Import the components in your React application:

```tsx
import { VectorMap } from 'ts-maps-react'
```

## Available Components

### VectorMap

The main component for displaying any supported map:

```tsx
import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-react'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f0f0f0',
  zoomOnScroll: true,
  regionsSelectable: true,
  style: {
    regions: {
      fill: '#e4e4e4',
      stroke: '#ffffff',
      strokeWidth: 1,
    },
    hover: {
      fill: '#2ca25f',
    },
  },
}

function App() {
  const handleRegionClick = (event: MouseEvent, code: string) => {
    console.log(`Clicked region: ${code}`)
  }

  const handleMapLoaded = () => {
    console.log('Map loaded successfully')
  }

  return (
    <VectorMap
      options={mapOptions}
      mapName="world"
      height="500px"
      onRegionClick={handleRegionClick}
      onLoaded={handleMapLoaded}
    />
  )
}
```

### Specific Map Components

For convenience, you can use dedicated components for specific maps:

#### World Map

```tsx
import { WorldMap } from 'ts-maps-react'

function App() {
  return <WorldMap options={mapOptions} />
}
```

#### United States Map

```tsx
import { UnitedStates } from 'ts-maps-react'

function App() {
  return <UnitedStates options={mapOptions} />
}
```

#### Canada Map

```tsx
import { Canada } from 'ts-maps-react'

function App() {
  return <Canada options={mapOptions} />
}
```

#### Brazil Map

```tsx
import { Brasil } from 'ts-maps-react'

function App() {
  return <Brasil options={mapOptions} />
}
```

#### Spain Map

```tsx
import { Spain } from 'ts-maps-react'

function App() {
  return <Spain options={mapOptions} />
}
```

#### Italy Map

```tsx
import { Italy } from 'ts-maps-react'

function App() {
  return <Italy options={mapOptions} />
}
```

#### Russia Map

```tsx
import { Russia } from 'ts-maps-react'

function App() {
  return <Russia options={mapOptions} />
}
```

#### Iraq Map

```tsx
import { Iraq } from 'ts-maps-react'

function App() {
  return <Iraq options={mapOptions} />
}
```

## Component Props

### VectorMap Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `options` | `Omit<MapOptions, 'selector'>` | ✅ | - | Map configuration options |
| `mapName` | `MapName` | ✅ | - | Name of the map to display |
| `width` | `string` | ❌ | `'100%'` | Width of the map container |
| `height` | `string` | ❌ | `'400px'` | Height of the map container |

### MapName Type

```ts
type MapName =
  | 'world'
  | 'world-merc'
  | 'us-merc'
  | 'us-mill'
  | 'us-lcc'
  | 'us-aea'
  | 'spain'
  | 'italy'
  | 'canada'
  | 'brasil'
  | 'russia'
```

## Events

All components support the following event handlers:

| Event | Handler | Payload | Description |
|-------|---------|---------|-------------|
| `onRegionClick` | `(event: MouseEvent, code: string) => void` | `(event, code)` | Fired when a region is clicked |
| `onRegionSelected` | `(event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => void` | `(event, code, isSelected, selectedRegions)` | Fired when a region is selected/deselected |
| `onMarkerClick` | `(event: MouseEvent, index: string) => void` | `(event, index)` | Fired when a marker is clicked |
| `onViewportChange` | `(scale: number, transX: number, transY: number) => void` | `(scale, transX, transY)` | Fired when the map viewport changes |
| `onLoaded` | `() => void` | `()` | Fired when the map is fully loaded |

## Data Visualization

Add data visualization to your maps:

```tsx
import type { DataVisualizationOptions, MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-react'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f0f0f0',
  zoomOnScroll: true,
}

function App() {
  const handleMapLoaded = () => {
    // Add data visualization after map loads
    const dataOptions: DataVisualizationOptions = {
      scale: ['#e5f5f9', '#2ca25f'],
      values: {
        US: 100,
        CA: 80,
        GB: 65,
        DE: 45,
        FR: 40,
      },
    }

    // Access the map instance and visualize data
    // This would typically be done through a ref or event
  }

  return (
    <VectorMap
      options={mapOptions}
      mapName="world"
      onLoaded={handleMapLoaded}
    />
  )
}
```

## Styling

Customize the appearance of your maps:

```tsx
import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-react'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#1a1a1a',
  zoomOnScroll: true,
  style: {
    regions: {
      fill: '#2d2d2d',
      stroke: '#404040',
      strokeWidth: 1,
    },
    hover: {
      fill: '#4a9eff',
    },
    selected: {
      fill: '#ff6b6b',
    },
  },
}

function App() {
  return (
    <VectorMap
      options={mapOptions}
      mapName="world"
      height="600px"
    />
  )
}
```

## Advanced Usage

### Custom Map Data

You can add custom map data:

```tsx
import { VectorMap as VectorMapCore } from 'ts-maps'
import { VectorMap } from 'ts-maps-react'
import customMapData from './custom-map-data'

// Add custom map data
VectorMapCore.addMap('custom', customMapData)

function App() {
  return (
    <VectorMap
      options={mapOptions}
      mapName="custom"
    />
  )
}
```

### Interactive Features

Enable interactive features:

```tsx
import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-react'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f0f0f0',
  zoomOnScroll: true,
  regionsSelectable: true,
  markersSelectable: true,
  zoomButtons: true,
  panOnDrag: true,
  style: {
    regions: {
      fill: '#e4e4e4',
      stroke: '#ffffff',
      strokeWidth: 1,
    },
    hover: {
      fill: '#2ca25f',
    },
    selected: {
      fill: '#ff6b6b',
    },
  },
}
```

## Examples

### Basic World Map

```tsx
import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-react'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f8f9fa',
  zoomOnScroll: true,
  regionsSelectable: true,
  style: {
    regions: {
      fill: '#e9ecef',
      stroke: '#dee2e6',
      strokeWidth: 1,
    },
    hover: {
      fill: '#007bff',
    },
    selected: {
      fill: '#28a745',
    },
  },
}

function App() {
  const handleRegionClick = (event: MouseEvent, code: string) => {
    console.log(`Clicked: ${code}`)
  }

  return (
    <div className="map-container">
      <h2>World Population Density</h2>
      <VectorMap
        options={mapOptions}
        mapName="world"
        height="500px"
        onRegionClick={handleRegionClick}
      />
    </div>
  )
}
```

### Interactive United States Map

```tsx
import type { MapOptions } from 'ts-maps'
import { useState } from 'react'
import { VectorMap } from 'ts-maps-react'

function App() {
  const [selectedStates, setSelectedStates] = useState<string[]>([])

  const mapOptions: Omit<MapOptions, 'selector'> = {
    backgroundColor: '#ffffff',
    zoomOnScroll: true,
    regionsSelectable: true,
    style: {
      regions: {
        fill: '#f8f9fa',
        stroke: '#dee2e6',
        strokeWidth: 1,
      },
      hover: {
        fill: '#007bff',
      },
      selected: {
        fill: '#28a745',
      },
    },
  }

  const handleStateClick = (event: MouseEvent, code: string) => {
    console.log(`Clicked state: ${code}`)
  }

  const handleStateSelection = (
    event: MouseEvent,
    code: string,
    isSelected: boolean,
    selectedRegions: string[]
  ) => {
    setSelectedStates(selectedRegions)
  }

  return (
    <div className="us-map-container">
      <h2>United States Interactive Map</h2>
      <VectorMap
        options={mapOptions}
        mapName="us-merc"
        height="600px"
        onRegionClick={handleStateClick}
        onRegionSelected={handleStateSelection}
      />
      {selectedStates.length > 0 && (
        <div className="selected-info">
          <h3>Selected States:</h3>
          <ul>
            {selectedStates.map(state => (
              <li key={state}>{state}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

## Troubleshooting

### Common Issues

1. **Map not displaying**: Ensure the container has proper dimensions
2. **Events not firing**: Check that event handlers are properly bound
3. **Styling not applied**: Verify the style object structure matches the expected format

### Performance Tips

- Use `mapKey` prop to force re-renders when options change significantly
- Avoid unnecessary re-renders by memoizing options objects
- Use specific map components when possible for better tree-shaking

## Next Steps

- Explore the [API Reference](/api/) for detailed configuration options
- Check out [Data Visualization](/features/data-visualization) for advanced features
- View [Examples](/showcase) for more use cases
